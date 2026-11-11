import Link from "next/link";
import { AlertPriceForm, WatchButton } from "@/components/watch-button";
import { EmptyState, PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth/session";
import { fmtMp } from "@/server/wallet";
import { myWatchlist } from "@/server/watchlist";

export const metadata = { title: "Watchlist" };

const TIER = { GOLD: "text-gold", SILVER: "text-silver", BRONZE: "text-bronze" } as const;

export default async function WatchlistPage() {
  const user = await requireUser();
  const items = await myWatchlist(user.id);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Alerts"
        title="Watchlist"
        intro="Follow players and we'll tell you when MATCHX drops one, when someone lists one (at or under your price, if you set one), when their value rises or falls 10% or more, and when they change tier. Watch a player from their page."
      />
      {items.length === 0 ? (
        <EmptyState title="Not watching anyone yet" action={<Link href="/top-performers" className="btn-primary">Find players</Link>}>
          Open any player&apos;s page and tap &ldquo;Watch player&rdquo;.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.playerId} className="row-item flex-wrap">
              <Link href={`/players/${i.playerId}`} className="min-w-0 flex-1 basis-48 hover:underline">
                <span className="flex items-center gap-2">
                  <span className="truncate font-display text-lg font-bold uppercase">{i.name}</span>
                  {i.tier && <span className={`text-[10px] font-extrabold ${TIER[i.tier]}`}>{i.tier}</span>}
                </span>
                <span className="block text-xs text-muted">
                  {i.position} · {i.club ?? "Free agent"}
                </span>
              </Link>
              <span className="w-28 shrink-0 text-right text-sm">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">On sale</span>
                {i.dropPriceMinor !== null ? (
                  <Link href="/transfers/drops" className="font-bold text-lime">
                    Drop · {fmtMp(i.dropPriceMinor)}
                  </Link>
                ) : i.lowestListingMinor !== null ? (
                  <Link href="/transfers" className="font-bold">
                    from {fmtMp(i.lowestListingMinor)}
                  </Link>
                ) : (
                  <span className="text-faint">—</span>
                )}
              </span>
              <span className="shrink-0">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Alert if listed at or under</span>
                <AlertPriceForm playerId={i.playerId} current={i.maxPriceMinor} />
              </span>
              <WatchButton playerId={i.playerId} initial />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
