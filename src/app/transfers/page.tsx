import Link from "next/link";
import { BuyButton } from "@/components/buy-button";
import { TradeRow } from "@/components/trade-row";
import { EmptyState, GateNotice, PageHeader } from "@/components/page-header";
import { MarketFilters } from "@/components/market-filters";
import { MoversPanel } from "@/components/movers-panel";
import { OfferButton } from "@/components/transfer-forms";
import type { CardCategory, Position } from "@/generated/prisma/client";
import { requireUser } from "@/server/auth/session";
import { isEnabled } from "@/server/flags";
import { cardsTradeableNow } from "@/server/launch";
import { listedFinishes, transferBoard } from "@/server/transfers-view";
import { balancesFor, fmtMp } from "@/server/wallet";

export const metadata = { title: "Transfers" };

const TIERS = ["GOLD", "SILVER", "BRONZE"] as const;
const POSITIONS = ["GK", "DEF", "MID", "ATT"] as const;
const SORTS = [
  ["new", "Newest"],
  ["price_asc", "Price ↑"],
  ["price_desc", "Price ↓"],
  ["ending", "Ending soon"],
] as const;

type SP = { tier?: string; pos?: string; league?: string; q?: string; sort?: string };
const LEAGUES = [
  ["EPL", "Premier League"],
  ["CHA", "Championship"],
  ["LG1", "League One"],
  ["LG2", "League Two"],
] as const;

export default async function TransfersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tier = TIERS.find((t) => t === sp.tier) as CardCategory | undefined;
  const finish = (["RUBY", "DIAMOND", "RAINBOW"] as const).find((t) => t === sp.tier);
  const league = LEAGUES.find(([c]) => c === sp.league)?.[0];
  const pos = POSITIONS.find((p) => p === sp.pos) as Position | undefined;
  const sort = (SORTS.find(([k]) => k === sp.sort)?.[0] ?? "new") as "new";
  const [open, tradeableNow, rows, bal] = await Promise.all([isEnabled("MARKET"), cardsTradeableNow(), transferBoard({ tier, finish, league, pos, q: sp.q?.trim() || undefined, sort }, user.id), balancesFor(user.id)]);
  const rare = await listedFinishes(false);

  return (
    <div>
      <PageHeader
        eyebrow="Buy &amp; sell"
        title="Transfer list"
        intro="Buy from other managers or make an offer. 5% seller fee."
      />

      <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="text-muted">Balance</span> <b className="tabular-nums text-lime">{fmtMp(bal.total)}</b>
        <span className="text-faint">· {bal.xp.toLocaleString("en-GB")} XP</span>
        <Link href="/account/wallet#add" className="text-xs font-bold text-lime underline-offset-2 hover:underline">Add funds →</Link>
      </p>

      {!tradeableNow && (
        <GateNotice>Cards you get before paid packs launch are yours to keep and play, but they can&apos;t be resold.</GateNotice>
      )}
      {!open && (
        <div className="mb-6 rounded-2xl border border-accent/40 bg-ink-900 px-6 py-10 text-center">
          <span className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-accent-ink">Coming soon</span>
          <p className="mt-4 font-display text-3xl font-bold uppercase italic">The Transfer Market</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Buy players from MATCHX and other managers, make offers, and sell to build a better squad. Opening soon.
          </p>
        </div>
      )}

      {open && (
        <>
      <div className="mb-4 space-y-3">
        <MarketFilters
          action="/transfers"
          q={sp.q}
          placeholder="Search player or club"
          selects={[
            { name: "league", label: "League", value: league ?? "", options: [["", "All leagues"], ...LEAGUES.map(([c, n]) => [c, n] as [string, string])] },
            { name: "pos", label: "Position", value: pos ?? "", options: [["", "All positions"], ["GK", "Goalkeepers"], ["DEF", "Defenders"], ["MID", "Midfielders"], ["ATT", "Attackers"]] },
            { name: "tier", label: "Type", value: tier ?? finish ?? "", options: [["", "All types"], ["GOLD", "Gold"], ["SILVER", "Silver"], ["BRONZE", "Bronze"], ...rare.map((k) => [k, `${k[0]}${k.slice(1).toLowerCase()} ✦`] as [string, string])] },
            { name: "sort", label: "Sort", value: sort === "new" ? "" : sort, options: [["", "Newest"], ["price_asc", "Price: low to high"], ["price_desc", "Price: high to low"], ["ending", "Ending soon"]] },
          ]}
        />
        <MoversPanel />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No cards listed" action={<Link href="/account/club" className="btn-ghost">List one from My Club</Link>}>
          {sp.q || tier || finish || league || pos ? "Nothing matches those filters." : "Be the first to list a card from your club."}
        </EmptyState>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const mine = !r.house && r.sellerId === user.id;
            return (
              <TradeRow
                key={r.id}
                card={r.card}
                href={`/cards/${r.card.id}`}
                priceLabel="Buy now"
                priceMinor={r.priceMinor}
                seller={<>Sold by <b className="text-fg">{r.sellerClub}</b></>}
                extra={[r.offers ? `${r.offers} offer${r.offers > 1 ? "s" : ""}` : null, r.avgMinor !== null ? `avg ${fmtMp(r.avgMinor)}` : null].filter(Boolean).join(" · ") || undefined}
                actions={
                  mine ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-faint">Your listing</span>
                  ) : (
                    <>
                      {!r.house && <OfferButton listingId={r.id} askMinor={r.priceMinor} enabled={open} existing={r.myOffer?.amountMinor} />}
                      <BuyButton listingId={r.id} label="Buy" confirm={`Sign ${r.card.name} for ${fmtMp(r.priceMinor)}?`} disabled={!open} className="btn-primary px-4 py-2 text-[11px]" />
                    </>
                  )
                }
              />
            );
          })}
        </ul>
      )}
        </>
      )}
      <p className="mt-6 text-xs text-faint">
        Card values go up and down and past prices don&apos;t predict future ones. Money from sales stays in the game for cards, packs and matches.
      </p>
    </div>
  );
}
