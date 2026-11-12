import { db } from "./db";
import { recentBigPulls } from "./hall-of-fame";
import { fmtMp } from "./wallet";

/**
 * Extra items for the strip under the header, beside the scores. Each page shows its own:
 *  - home (and pages without their own): games kicking off in the next 6 hours, by the names the
 *    admin gave them, then the scores, then last gameweek's top performers;
 *  - transfers: recent transfers and big pulls;
 *  - matches / sim: scores only.
 */
export type TickerMode = "home" | "transfers" | "matches" | "sim";

export interface TickerItem {
  key: string;
  kind: "upcoming" | "top" | "transfer" | "pull";
  tag: string;
  title: string;
  sub?: string;
  value?: string;
  tone?: "lime" | "gold" | "silver" | "bronze" | "sim";
}

const HOUR = 3_600_000;
const ukTime = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

let topCache: { at: number; items: TickerItem[] } | null = null;

async function topPerformers(now: Date): Promise<TickerItem[]> {
  if (topCache && now.getTime() - topCache.at < 5 * 60_000) return topCache.items;
  const { performanceTable } = await import("./top-performers");
  const rows = (await performanceTable({ window: "last" }).catch(() => [])).sort((a, b) => b.points - a.points).slice(0, 10);
  const items = rows.map((r, i): TickerItem => ({ key: `top:${r.playerId}`, kind: "top", tag: i === 0 ? "Top performer" : `#${i + 1}`, title: r.name, sub: r.clubShort ?? r.club ?? undefined, value: `${Math.round(r.points * 10) / 10} pts`, tone: "lime" }));
  topCache = { at: now.getTime(), items };
  return items;
}

/** Matches kicking off in the next 6 hours (real or sim), by the names they were given. */
async function upcoming(now: Date): Promise<TickerItem[]> {
  const comps = await db.competition.findMany({
    where: { status: { in: ["OPEN", "UPCOMING", "LOCKED"] }, locksAt: { gt: new Date(now.getTime() - 15 * 60_000), lte: new Date(now.getTime() + 6 * HOUR) } },
    orderBy: [{ locksAt: "asc" }, { name: "asc" }],
    take: 12,
    select: { id: true, name: true, locksAt: true, rewards: true, gameweek: { select: { simulated: true, startsAt: true } } },
  });
  const kickoff = (c: (typeof comps)[number]) => (c.gameweek.simulated ? c.gameweek.startsAt : new Date(c.locksAt.getTime() + 10 * 60_000));
  // Until kick-off (squads lock a little before).
  return comps.filter((c) => kickoff(c) > now).map((c) => {
    const ko = kickoff(c);
    const pot = ((c.rewards as Array<{ cashMinor?: number }>) ?? []).reduce((s, r) => s + (r.cashMinor ?? 0), 0);
    return { key: `up:${c.id}`, kind: "upcoming", tag: c.gameweek.simulated ? "Sim · up next" : "Up next", title: c.name, sub: `KO ${ukTime(ko)}`, value: pot ? `£${pot % 100 ? (pot / 100).toFixed(2) : pot / 100} Pot` : undefined, tone: c.gameweek.simulated ? "sim" : "lime" };
  });
}

async function transfers(): Promise<TickerItem[]> {
  const [sales, pulls] = await Promise.all([
    db.marketListing.findMany({
      where: { status: "SOLD", soldAt: { not: null } },
      orderBy: { soldAt: "desc" },
      take: 20,
      select: { id: true, soldAt: true, soldPriceMinor: true, buyer: { select: { displayName: true } }, seller: { select: { displayName: true } }, card: { select: { template: { select: { category: true, player: { select: { displayName: true } } } } } } },
    }),
    recentBigPulls().catch(() => []),
  ]);
  const tone = { GOLD: "gold", SILVER: "silver", BRONZE: "bronze" } as const;
  const items: Array<TickerItem & { at: number }> = [
    ...sales.map((s) => ({
      at: s.soldAt!.getTime(),
      key: `sale:${s.id}`,
      kind: "transfer" as const,
      tag: "Transfer",
      title: s.card.template.player.displayName,
      sub: `${s.buyer?.displayName ?? "A manager"} from ${s.seller?.displayName ?? "MATCHX"}`,
      value: fmtMp(s.soldPriceMinor ?? 0),
      tone: tone[s.card.template.category as keyof typeof tone] ?? "lime",
    })),
    ...pulls.map((p) => ({ at: p.at.getTime(), key: `pull:${p.id}`, kind: "pull" as const, tag: p.kind === "RAINBOW" ? "Rainbow pull!" : "Diamond pull", title: p.player, sub: p.manager, tone: "sim" as const })),
  ];
  return items.sort((a, b) => b.at - a.at).map(({ at: _at, ...i }) => i);
}

export async function tickerItems(mode: TickerMode, now = new Date()): Promise<{ before: TickerItem[]; after: TickerItem[] }> {
  if (mode === "home") {
    const [up, top] = await Promise.all([upcoming(now), topPerformers(now)]);
    return { before: up, after: top };
  }
  if (mode === "transfers") return { before: await transfers(), after: [] };
  return { before: [], after: [] };
}
