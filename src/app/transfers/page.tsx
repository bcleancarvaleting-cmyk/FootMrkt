import Link from "next/link";
import { BuyButton } from "@/components/buy-button";
import { ActionButton } from "@/components/action-button";
import { CardRow, RowStat, Sparkline } from "@/components/card-row";
import { EmptyState, GateNotice, PageHeader } from "@/components/page-header";
import { FoundingBadge } from "@/components/founding-badge";
import { OfferButton } from "@/components/transfer-forms";
import type { CardCategory, Position } from "@/generated/prisma/client";
import { requireUser } from "@/server/auth/session";
import { isEnabled } from "@/server/flags";
import { cardsTradeableNow } from "@/server/launch";
import { transferBoard } from "@/server/transfers-view";
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

type SP = { tier?: string; pos?: string; q?: string; sort?: string };

function qs(sp: SP, patch: Partial<SP>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/transfers?${s}` : "/transfers";
}

export default async function TransfersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tier = TIERS.find((t) => t === sp.tier) as CardCategory | undefined;
  const pos = POSITIONS.find((p) => p === sp.pos) as Position | undefined;
  const sort = (SORTS.find(([k]) => k === sp.sort)?.[0] ?? "new") as "new";
  const [open, tradeableNow, rows, bal] = await Promise.all([isEnabled("MARKET"), cardsTradeableNow(), transferBoard({ tier, pos, q: sp.q?.trim() || undefined, sort }, user.id), balancesFor(user.id)]);

  return (
    <div>
      <PageHeader
        eyebrow="Buy &amp; sell"
        title="Transfer list"
        intro="Player-to-player transfers: buy from other managers or make an offer, in earned credit. The seller pays a 5% fee when a card sells. Prices are capped at 100 MX, except Rubies, Diamonds and Rainbows, which their owners can price far higher. New players from MATCHX are released as Player drops."
      />

      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-ink-700 bg-ink-900 px-4 py-3 text-sm">
        <span className="mr-auto">
          <span className="text-muted">Earned credit to spend</span> <b className="ml-1 tabular-nums">{fmtMp(bal.earned)}</b>
          <span className="ml-3 text-faint">· {bal.xp.toLocaleString("en-GB")} XP</span>
        </span>
        <span className="text-xs text-faint">The Transfer list uses earned credit: from XP, challenges and selling cards.</span>
        <Link href="/account/wallet#xp" className="btn-ghost px-3 py-1.5 text-[11px]">Swap XP for £</Link>
      </div>

      {!tradeableNow && (
        <GateNotice>Cards you get before paid packs launch are yours to keep and play, but they can&apos;t be resold.</GateNotice>
      )}
      {!open && (
        <div className="mb-6 rounded-2xl border border-accent/40 bg-ink-900 px-6 py-10 text-center">
          <span className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-accent-ink">Coming soon</span>
          <p className="mt-4 font-display text-3xl font-bold uppercase italic">The Transfer Market</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Buy players from MATCHX and other managers with earned credit, make offers, and sell to build a better squad. Opening soon — keep earning XP in the meantime.
          </p>
        </div>
      )}

      {open && (
        <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action="/transfers" className="flex min-w-0 flex-1 basis-60 gap-2">
          {tier && <input type="hidden" name="tier" value={tier} />}
          {pos && <input type="hidden" name="pos" value={pos} />}
          <input name="q" defaultValue={sp.q} placeholder="Search player or club" className="input" />
        </form>
        <div className="flex flex-wrap gap-1.5">
          {TIERS.map((t) => (
            <Link key={t} href={qs(sp, { tier: tier === t ? undefined : t })} className={`chip ${tier === t ? "border-accent text-fg" : ""}`}>
              {t[0] + t.slice(1).toLowerCase()}
            </Link>
          ))}
          <span className="mx-1 w-px self-stretch bg-ink-700" />
          {POSITIONS.map((p) => (
            <Link key={p} href={qs(sp, { pos: pos === p ? undefined : p })} className={`chip ${pos === p ? "border-accent text-fg" : ""}`}>
              {p}
            </Link>
          ))}
          <span className="mx-1 w-px self-stretch bg-ink-700" />
          {SORTS.map(([k, l]) => (
            <Link key={k} href={qs(sp, { sort: k === "new" ? undefined : k })} className={`chip ${sort === k ? "border-accent text-fg" : ""}`}>
              {l}
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-2 hidden items-center gap-4 px-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint lg:flex">
        <span className="w-9 text-center">Pos</span>
        <span className="flex-1">Player · Club · Seller</span>
        <span className="w-24 text-right">Value</span>
        <span className="w-24 text-right">Avg sold</span>
        <span className="w-24 text-center">All time</span>
        <span className="w-[220px] text-right">Offer · Buy now</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No cards listed" action={<Link href="/account/club" className="btn-ghost">List one from My Club</Link>}>
          {sp.q || tier || pos ? "Nothing matches those filters." : "Be the first to list a card from your club."}
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const mine = !r.house && r.sellerId === user.id;
            return (
              <CardRow
                key={r.id}
                card={r.card}
                href={`/cards/${r.card.id}`}
                sub={
                  r.house ? (
                    <span className="ml-1 rounded bg-accent px-1.5 text-[10px] font-extrabold uppercase tracking-wider text-accent-ink">MATCHX</span>
                  ) : (
                    <span className="flex min-w-0 items-center gap-1 truncate text-faint">· by <span className="text-muted">{r.seller}</span><FoundingBadge number={r.sellerFounding} compact /></span>
                  )
                }
              >
                <RowStat label="Avg sold" className="hidden w-24 lg:block">
                  {r.avgMinor !== null ? fmtMp(r.avgMinor) : "—"}
                  {r.sales > 0 && <span className="block text-[10px] font-normal text-faint">{r.sales} sale{r.sales > 1 ? "s" : ""}</span>}
                </RowStat>
                <span className="hidden w-24 justify-center lg:flex">
                  <Sparkline points={r.history} />
                </span>
                <span className="flex shrink-0 items-center justify-end gap-2 sm:w-[220px]">
                  {mine ? (
                    <>
                      <span className="text-right text-[10px] text-faint">{r.offers ? `${r.offers} offer${r.offers > 1 ? "s" : ""}` : "Your listing"}</span>
                    </>
                  ) : (
                    <>
                      <span className="hidden sm:block">
                        {r.house ? (
                          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">Buy now only</span>
                        ) : (
                          <OfferButton listingId={r.id} askMinor={r.priceMinor} enabled={open} existing={r.myOffer?.amountMinor} />
                        )}
                      </span>
                      <BuyButton listingId={r.id} label={fmtMp(r.priceMinor)} confirm={`Sign ${r.card.name} for ${fmtMp(r.priceMinor)}?`} disabled={!open} />
                    </>
                  )}
                </span>
              </CardRow>
            );
          })}
        </ul>
      )}
        </>
      )}
      <p className="mt-6 text-xs text-faint">
        Card values go up and down and past prices don&apos;t predict future ones. Money from sales is earned credit: it stays in the game for cards, packs and matches.
      </p>
    </div>
  );
}
