import Link from "next/link";
import { AddToBasketButton } from "@/components/basket-buttons";
import { TradeRow } from "@/components/trade-row";
import { MarketFilters } from "@/components/market-filters";
import { MoversPanel } from "@/components/movers-panel";
import { EmptyState, PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth/session";
import { basketIds } from "@/server/basket";
import { isEnabled } from "@/server/flags";
import { type MarketSort, marketBoard } from "@/server/market-board";
import { listedFinishes } from "@/server/transfers-view";

export const metadata = { title: "MATCHX market" };
export const dynamic = "force-dynamic";

type SP = { q?: string; tier?: string; pos?: string; league?: string; sort?: string; page?: string };
const LEAGUES = [
  ["EPL", "Premier League"],
  ["CHA", "Championship"],
  ["LG1", "League One"],
  ["LG2", "League Two"],
] as const;

export default async function MarketPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tier = (["BRONZE", "SILVER", "GOLD"] as const).find((t) => t === sp.tier);
  const finish = (["RUBY", "DIAMOND", "RAINBOW"] as const).find((t) => t === sp.tier);
  const pos = (["GK", "DEF", "MID", "ATT"] as const).find((p) => p === sp.pos);
  const league = LEAGUES.find(([c]) => c === sp.league)?.[0];
  const sort = (["value", "cheap", "left"] as const).find((s) => s === sp.sort) ?? ("value" as MarketSort);
  const q = sp.q?.trim().slice(0, 40) || undefined;
  const [open, board, inBasket] = await Promise.all([isEnabled("MARKET"), marketBoard({ q, tier, finish, pos, league, sort, page: Number(sp.page) || 1 }), basketIds(user.id)]);
  const rare = await listedFinishes(true);
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, tier: tier ?? finish, pos, league, sort: sort === "value" ? undefined : sort, ...patch })) if (v) p.set(k, v);
    return `/transfers/market${p.size ? `?${p}` : ""}`;
  };
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sold by MATCHX"
        title="MATCHX market"
        intro="Every player at market value. Few copies — each sale makes the next 2% dearer."
      />

      <MarketFilters
        action="/transfers/market"
        q={q}
        selects={[
          { name: "league", label: "League", value: league ?? "", options: [["", "All leagues"], ...LEAGUES.map(([c, n]) => [c, n] as [string, string])] },
          { name: "pos", label: "Position", value: pos ?? "", options: [["", "All positions"], ["GK", "Goalkeepers"], ["DEF", "Defenders"], ["MID", "Midfielders"], ["ATT", "Attackers"]] },
          { name: "tier", label: "Type", value: tier ?? finish ?? "", options: [["", "All types"], ["GOLD", "Gold"], ["SILVER", "Silver"], ["BRONZE", "Bronze"], ...rare.map((k) => [k, `${k[0]}${k.slice(1).toLowerCase()} ✦`] as [string, string])] },
          { name: "sort", label: "Sort", value: sort === "value" ? "" : sort, options: [["", "Most valuable"], ["cheap", "Cheapest"], ["left", "Fewest left"]] },
        ]}
      />

      <MoversPanel />

      {board.rows.length === 0 ? (
        <EmptyState title={q || tier || finish || pos || league ? "No players match" : "The market opens soon"}>
          {q || tier || finish || pos || league ? "Try another search or filter." : "MATCHX releases copies of every player here. Check back shortly."}
        </EmptyState>
      ) : (
        <>
          <p className="text-xs text-faint">{board.total.toLocaleString("en-GB")} players on sale · page {board.page} of {board.pages}</p>
          <ul className="space-y-1.5">
            {board.rows.map((r) => (
              <TradeRow
                key={r.listingId}
                card={r.card}
                href={`/players/${r.card.playerId}`}
                priceLabel="Buy now"
                priceMinor={r.priceMinor}
                seller="Sold by MATCHX"
                extra={<span className={r.copies <= 2 ? "font-bold text-danger" : ""}>{r.copies} left</span>}
                actions={<AddToBasketButton listingId={r.listingId} price="" inBasket={inBasket.has(r.listingId)} disabled={!open} />}
              />
            ))}
          </ul>
          {board.pages > 1 && (
            <nav className="flex items-center justify-center gap-3" aria-label="Pages">
              {board.page > 1 && <Link href={qs({ page: String(board.page - 1) })} className="btn-ghost px-4 py-2 text-xs">← Previous</Link>}
              <span className="text-sm text-muted">Page {board.page} of {board.pages}</span>
              {board.page < board.pages && <Link href={qs({ page: String(board.page + 1) })} className="btn-ghost px-4 py-2 text-xs">Next →</Link>}
            </nav>
          )}
        </>
      )}
      <p className="text-xs text-faint">Values are indicative and go up and down. Your £ balance is spend-only and can&apos;t be withdrawn.</p>
    </div>
  );
}
