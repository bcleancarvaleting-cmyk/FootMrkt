import Link from "next/link";
import { AddToBasketButton } from "@/components/basket-buttons";
import { CardRow } from "@/components/card-row";
import { FormGuide } from "@/components/form-guide";
import { EmptyState, PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth/session";
import { basketIds } from "@/server/basket";
import { isEnabled } from "@/server/flags";
import { type MarketSort, marketBoard } from "@/server/market-board";
import { formGuide } from "@/server/top-performers";
import { fmtMp } from "@/server/wallet";

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
  const pos = (["GK", "DEF", "MID", "ATT"] as const).find((p) => p === sp.pos);
  const league = LEAGUES.find(([c]) => c === sp.league)?.[0];
  const sort = (["value", "cheap", "left"] as const).find((s) => s === sp.sort) ?? ("value" as MarketSort);
  const q = sp.q?.trim().slice(0, 40) || undefined;
  const [open, board, inBasket] = await Promise.all([isEnabled("MARKET"), marketBoard({ q, tier, pos, league, sort, page: Number(sp.page) || 1 }), basketIds(user.id)]);
  const form = await formGuide(board.rows.map((r) => r.card.playerId));
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, tier, pos, league, sort: sort === "value" ? undefined : sort, ...patch })) if (v) p.set(k, v);
    return `/transfers/market${p.size ? `?${p}` : ""}`;
  };
  const chip = (on: boolean) => `chip ${on ? "border-accent text-fg" : ""}`;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sold by MATCHX"
        title="MATCHX market"
        intro="Every player in the game, on sale now at their market value — set by their form this season, real-world value and how much managers want them. Only a few copies of each: every one sold makes the rest 2% dearer. New batches are released at the latest prices."
      />

      <form action="/transfers/market" className="flex max-w-md gap-2" role="search">
        {tier && <input type="hidden" name="tier" value={tier} />}
        {pos && <input type="hidden" name="pos" value={pos} />}
        {league && <input type="hidden" name="league" value={league} />}
        <label htmlFor="mk-q" className="sr-only">Search for a player or club</label>
        <input id="mk-q" name="q" type="search" defaultValue={q} placeholder="Search for a player or club" className="input flex-1" />
        <button className="btn-primary px-4">Search</button>
      </form>

      <nav className="flex flex-wrap items-center gap-2" aria-label="Filters">
        {(["value", "cheap", "left"] as const).map((s) => (
          <Link key={s} href={qs({ sort: s === "value" ? undefined : s, page: undefined })} className={chip(sort === s)}>
            {s === "value" ? "Most valuable" : s === "cheap" ? "Cheapest" : "Fewest left"}
          </Link>
        ))}
        <span className="mx-1 w-px self-stretch bg-ink-700" />
        {(["GOLD", "SILVER", "BRONZE"] as const).map((t) => (
          <Link key={t} href={qs({ tier: tier === t ? undefined : t, page: undefined })} className={chip(tier === t)}>
            {t[0] + t.slice(1).toLowerCase()}
          </Link>
        ))}
        <span className="mx-1 w-px self-stretch bg-ink-700" />
        {LEAGUES.map(([c, n]) => (
          <Link key={c} href={qs({ league: league === c ? undefined : c, page: undefined })} className={chip(league === c)}>
            {n}
          </Link>
        ))}
        <span className="mx-1 w-px self-stretch bg-ink-700" />
        {(["GK", "DEF", "MID", "ATT"] as const).map((p) => (
          <Link key={p} href={qs({ pos: pos === p ? undefined : p, page: undefined })} className={chip(pos === p)}>
            {p}
          </Link>
        ))}
      </nav>

      {board.rows.length === 0 ? (
        <EmptyState title={q || tier || pos || league ? "No players match" : "The market opens soon"}>
          {q || tier || pos || league ? "Try another search or filter." : "MATCHX releases copies of every player here. Check back shortly."}
        </EmptyState>
      ) : (
        <>
          <p className="text-xs text-faint">{board.total.toLocaleString("en-GB")} players on sale · page {board.page} of {board.pages}</p>
          <ul className="space-y-2">
            {board.rows.map((r) => (
              <CardRow
                key={r.listingId}
                card={r.card}
                href={`/players/${r.card.playerId}`}
                sub={<span className={`rounded px-1.5 text-[10px] font-extrabold uppercase tracking-wider ${r.copies <= 2 ? "bg-danger/15 text-danger" : "bg-ink-700 text-muted"}`}>{r.copies} left</span>}
                below={form.has(r.card.playerId) && <FormGuide form={form.get(r.card.playerId)!} />}
              >
                <AddToBasketButton listingId={r.listingId} price={fmtMp(r.priceMinor)} inBasket={inBasket.has(r.listingId)} disabled={!open} />
              </CardRow>
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
