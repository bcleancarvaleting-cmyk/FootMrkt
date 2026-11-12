import { AddToBasketButton } from "@/components/basket-buttons";
import { basketIds } from "@/server/basket";
import { CardRow, RowStat } from "@/components/card-row";
import { Countdown } from "@/components/countdown";
import { EmptyState, PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth/session";
import { isEnabled } from "@/server/flags";
import { dropBoard } from "@/server/player-drops";
import { formGuide, topPerLeague } from "@/server/top-performers";
import { FormGuide } from "@/components/form-guide";
import { fmtMp } from "@/server/wallet";
import { fmtDate } from "@/lib/view";

export const metadata = { title: "Player drops" };

export default async function DropsPage() {
  const user = await requireUser();
  const [open, board, tops, inBasket] = await Promise.all([isEnabled("MARKET"), dropBoard(), topPerLeague("5"), basketIds(user.id)]);
  const topIds = new Set([...tops.values()].flat().map((r) => r.playerId));
  const form = await formGuide([...board.live, ...board.upcoming.slice(0, 30)].map((d) => d.card.playerId));
  const tag = (playerId: string) => (
    <>
      <span className="ml-1 rounded bg-accent px-1.5 text-[10px] font-extrabold uppercase tracking-wider text-accent-ink">Drop</span>
      {topIds.has(playerId) && <span className="ml-1 rounded border border-gold/60 px-1.5 text-[10px] font-extrabold uppercase tracking-wider text-gold">★ Top performer</span>}
    </>
  );
  const next = board.upcoming[0];
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Released by MATCHX"
        title="Player drops"
        intro="New players released by MATCHX every day. One copy each, never found in packs. Add the ones you want to your basket, then pay for them all at once with MX — no fees. First come, first served: once a drop is live it stays on sale until someone signs them. Any Gold you sign could turn out to be a Ruby or even a Diamond."
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
          <ul className="space-y-2">
            {board.live.map((d) => (
              <CardRow find={false} key={d.id} card={d.card} href={`/cards/${d.card.id}`} sub={tag(d.card.playerId)} below={form.has(d.card.playerId) && <FormGuide form={form.get(d.card.playerId)!} />}>
                <RowStat label="Dropped" className="hidden w-28 sm:block">
                  <span className="text-sm font-semibold">{fmtDate(d.liveAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </RowStat>
                <AddToBasketButton listingId={d.id} price={fmtMp(d.priceMinor)} inBasket={inBasket.has(d.id)} disabled={!open} />
              </CardRow>
            ))}
          </ul>
        )}
      </section>

      {board.upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 text-2xl">Coming up</h2>
          <ul className="divide-y divide-ink-700 rounded-2xl border border-ink-700 bg-ink-900">
            {board.upcoming.slice(0, 30).map((d) => (
              <li key={d.id} className={`tier-${d.card.category} flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm`}>
                <span className="min-w-0">
                  <b>{d.card.name}</b> {topIds.has(d.card.playerId) && <span className="text-xs text-gold">★ Top performer</span>} <span className="text-faint">· {d.card.clubName} · {d.card.category.toLowerCase()}</span>
                  {form.has(d.card.playerId) && <FormGuide form={form.get(d.card.playerId)!} />}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-bold tabular-nums">{fmtMp(d.priceMinor)}</span>
                  <Countdown to={d.liveAt.toISOString()} className="text-xs text-lime" />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
