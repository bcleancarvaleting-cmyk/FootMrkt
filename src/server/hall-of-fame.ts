import { toCrest } from "@/lib/crest";
import { db } from "./db";
import { CARD_INCLUDE, enrichCards } from "./views";

/**
 * The Hall of Fame: every Rainbow (one of one) found so far and who holds it, plus the latest
 * Diamonds and Rubies, and how many of each are still out there.
 */
export async function hallOfFame() {
  const [rainbows, diamonds, rubies, players, golds] = await Promise.all([
    db.cardFinish.findMany({ where: { kind: "RAINBOW" }, orderBy: { createdAt: "desc" }, include: { card: { include: { ...CARD_INCLUDE, owner: { select: { displayName: true, clubName: true, crest: true } } } } } }),
    db.cardFinish.findMany({ where: { kind: "DIAMOND" }, orderBy: { createdAt: "desc" }, take: 12, include: { card: { include: { ...CARD_INCLUDE, owner: { select: { displayName: true, clubName: true, crest: true } } } } } }),
    db.cardFinish.count({ where: { kind: "RUBY" } }),
    db.player.count({ where: { active: true, templates: { some: { edition: "STANDARD", active: true } } } }),
    db.cardTemplate.count({ where: { edition: "STANDARD", active: true, category: "GOLD" } }),
  ]);
  const [rainbowViews, diamondViews] = await Promise.all([enrichCards(rainbows.map((r) => r.card)), enrichCards(diamonds.map((d) => d.card))]);
  const holder = (o: { displayName: string; clubName: string | null; crest: unknown } | null) =>
    o ? { name: o.displayName, clubName: o.clubName, crest: toCrest(o.crest) } : null;
  return {
    rainbows: rainbows.map((r, i) => ({ card: rainbowViews[i], foundAt: r.createdAt, holder: holder(r.card.owner) })),
    diamonds: diamonds.map((d, i) => ({ card: diamondViews[i], foundAt: d.createdAt, holder: holder(d.card.owner) })),
    counts: {
      rainbows: rainbows.length,
      rainbowsTotal: players,
      diamonds: await db.cardFinish.count({ where: { kind: "DIAMOND" } }),
      diamondsTotal: golds * 5,
      rubies,
      rubiesTotal: golds * 10,
    },
  };
}

/** Recent Rainbow and Diamond pulls for the scrolling banner. */
export async function recentBigPulls(take = 10) {
  const rows = await db.cardFinish.findMany({
    where: { kind: { in: ["RAINBOW", "DIAMOND"] } },
    orderBy: { createdAt: "desc" },
    take,
    include: { card: { select: { owner: { select: { displayName: true } }, template: { select: { player: { select: { displayName: true } } } } } } },
  });
  return rows.map((r) => ({ id: r.id, kind: r.kind, serial: r.serial, at: r.createdAt, manager: r.card.owner?.displayName ?? "A manager", player: r.card.template.player.displayName }));
}
