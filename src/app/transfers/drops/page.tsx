import { AddToBasketButton } from "@/components/basket-buttons";
import { basketIds } from "@/server/basket";
import { TradeRow } from "@/components/trade-row";
import { Countdown } from "@/components/countdown";
import { EmptyState, PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth/session";
import { isEnabled } from "@/server/flags";
import { dropBoard } from "@/server/player-drops";
import { topPerLeague } from "@/server/top-performers";
import { fmtDate } from "@/lib/view";

export const metadata = { title: "Player drops" };

export default async function DropsPage() {
  const user = await requireUser();
  const [open, board, tops, inBasket] = await Promise.all([isEnabled("MARKET"), dropBoard(), topPerLeague("5"), basketIds(user.id)]);
  const topIds = new Set([...tops.values()].flat().map((r) => r.playerId));
  const next = board.upcoming[0];
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Released by MATCHX"
        title="Player drops"
        intro="New players from MATCHX every day — one copy each, never in packs. First come, first served."
      >
        {next && (
          <span className="rounded-xl border border-accent/40 bg-ink-900 px-3 py-2 text-sm">
            Next drop in <Countdown to={next.liveAt.toISOString()} className="font-bold text-lime" />
          </span>
        )}
      </PageHeader>

      <section>
        <h2 className="mb-3 text-2xl">On sale now</h2>
        {board.live.length === 0 ? (
          <EmptyState title="Nothing on sale right now">{next ? `The next players drop ${fmtDate(next.liveAt)}.` : "New drops are announced here and in the app."}</EmptyState>
        ) : (
          <ul className="space-y-1.5">
            {board.live.map((d) => (
              <TradeRow
                key={d.id}
                card={d.card}
                href={`/cards/${d.card.id}`}
                priceLabel="Buy now"
                priceMinor={d.priceMinor}
                seller="Dropped by MATCHX"
                tag={topIds.has(d.card.playerId) ? <span className="ml-1 text-gold">★ Top</span> : undefined}
                extra={fmtDate(d.liveAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                actions={<AddToBasketButton listingId={d.id} price="" inBasket={inBasket.has(d.id)} disabled={!open} />}
              />
            ))}
          </ul>
        )}
      </section>

      {board.upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 text-2xl">Coming up</h2>
          <ul className="space-y-1.5">
            {board.upcoming.slice(0, 30).map((d) => (
              <TradeRow
                key={d.id}
                card={d.card}
                priceLabel="Price"
                priceMinor={d.priceMinor}
                seller="Dropping"
                tag={topIds.has(d.card.playerId) ? <span className="ml-1 text-gold">★ Top</span> : undefined}
                extra={<Countdown to={d.liveAt.toISOString()} className="font-bold text-lime" />}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
