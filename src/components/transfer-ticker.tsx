import { db } from "@/server/db";
import { fmtMp } from "@/server/wallet";
import { relativeTime } from "@/lib/view";
import { recentBigPulls } from "@/server/hall-of-fame";

/** "Recent transfers" banner: a fixed label with the latest completed transfers scrolling behind it. */
export async function TransferTicker() {
  const pulls = await recentBigPulls();
  const sales = await db.marketListing.findMany({
    where: { status: "SOLD", soldAt: { not: null } },
    orderBy: { soldAt: "desc" },
    take: 20,
    include: {
      buyer: { select: { displayName: true } },
      seller: { select: { displayName: true } },
      card: { include: { template: { include: { player: { select: { displayName: true } } } } } },
    },
  });
  if (!sales.length && !pulls.length) return null;
  const items = sales.map((s) => ({
    at: s.soldAt!,
    id: s.id,
    buyer: s.buyer?.displayName ?? "A manager",
    seller: s.seller?.displayName ?? "MATCHX",
    player: s.card.template.player.displayName,
    tier: s.card.template.category,
    price: fmtMp(s.soldPriceMinor ?? 0),
    when: relativeTime(s.soldAt!),
  }));
  // Rainbow and Diamond pulls are big news: they go in the banner too, newest first.
  const news = pulls.map((p) => ({ id: p.id, at: p.at, kind: p.kind, serial: p.serial, manager: p.manager, player: p.player, when: relativeTime(p.at) }));
  const feed: Array<({ type: "sale" } & (typeof items)[number]) | ({ type: "pull" } & (typeof news)[number])> = [
    ...items.map((i) => ({ type: "sale" as const, ...i })),
    ...news.map((n) => ({ type: "pull" as const, ...n })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  const tone = { GOLD: "text-gold", SILVER: "text-silver", BRONZE: "text-bronze" } as const;
  const row = (dup: boolean) => (
    <ul className="flex shrink-0 items-center gap-8 pr-8" aria-hidden={dup || undefined}>
      {feed.map((i) =>
        i.type === "pull" ? (
          <li key={i.id} className="flex items-center gap-1.5 whitespace-nowrap text-sm">
            <b className="text-fg">{i.manager}</b>
            <span className="text-muted">pulled</span>
            {i.kind === "RAINBOW" ? (
              <b className="rainbow-name uppercase">the only Rainbow {i.player}!</b>
            ) : (
              <b className="text-[#8fe3ff]">
                Diamond {i.player} ({i.serial} of 5)
              </b>
            )}
            <span className="text-faint">· {i.when}</span>
          </li>
        ) : (
        <li key={i.id} className="flex items-center gap-1.5 whitespace-nowrap text-sm">
          <b className="text-fg">{i.buyer}</b>
          <span className="text-muted">bought</span>
          <b className={tone[i.tier]}>{i.player}</b>
          <span className="text-muted">off</span>
          <b className="text-fg">{i.seller}</b>
          <span className="text-muted">for</span>
          <b className="tabular-nums text-lime">{i.price}</b>
          <span className="text-faint">· {i.when}</span>
        </li>
        ),
      )}
    </ul>
  );
  return (
    <div className="mb-6 flex items-stretch overflow-hidden rounded-xl border border-ink-700 bg-ink-900" role="region" aria-label="Recent transfers">
      <span className="z-10 flex shrink-0 items-center gap-2 bg-accent px-3 text-[11px] font-extrabold uppercase tracking-[0.16em] text-accent-ink">
        <span className="live-dot" aria-hidden="true" /> Recent transfers
      </span>
      <div className="ticker-mask relative min-w-0 flex-1 overflow-hidden py-2.5">
        <div className="ticker-track flex w-max">
          {row(false)}
          {row(true)}
        </div>
      </div>
    </div>
  );
}
