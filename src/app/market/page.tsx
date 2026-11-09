import Link from "next/link";
import { buyListingAction, cancelListingAction } from "@/app/actions/game";
import { ActionButton } from "@/components/action-button";
import { ClubTabs } from "@/components/club-tabs";
import { PlayerCard } from "@/components/player-card";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { isEnabled } from "@/server/flags";
import { CARD_INCLUDE, enrichCards } from "@/server/views";
import { gbp, relativeTime } from "@/lib/view";

export const metadata = { title: "Transfer Market" };

/** Shows "coming soon" — no market functionality — unless the legal-gated MARKET flag is on (spec §17). */
export default async function MarketPage({ searchParams }: { searchParams: Promise<{ category?: string; position?: string }> }) {
  const user = await requireUser();
  if (!(await isEnabled("MARKET"))) {
    return (
      <div>
        <ClubTabs active="transfers" />
        <div className="panel mx-auto max-w-2xl p-8 text-center">
          <p className="eyebrow">Transfers</p>
          <h1 className="mt-2 text-5xl font-extrabold">Transfer market coming soon</h1>
          <p className="mx-auto mt-3 max-w-md text-muted">
            Buying and selling cards with other managers opens once our legal and payment checks are complete. Until then, build your
            squad from packs and complete sets to earn MP credit.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/packs" className="btn-gold">
              Open packs
            </Link>
            <Link href="/collections" className="btn-ghost">
              View sets
            </Link>
          </div>
        </div>
      </div>
    );
  }
  const sp = await searchParams;
  const listings = await db.marketListing.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { gt: new Date() },
      card: {
        template: {
          ...(sp.category ? { category: sp.category as "GOLD" } : {}),
          ...(sp.position ? { player: { position: sp.position as "GK" } } : {}),
        },
      },
    },
    include: { card: { include: CARD_INCLUDE }, seller: { select: { displayName: true } } },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  const views = await enrichCards(listings.map((l) => l.card));
  return (
    <div className="space-y-6">
      <ClubTabs active="transfers" />
      <div>
        <p className="eyebrow">Transfer Market</p>
        <h1 className="text-5xl font-extrabold">Buy cards from other managers</h1>
        <p className="text-sm text-muted">Asking price is set by the seller. MP is an indicative valuation and is shown separately.</p>
      </div>
      <form className="flex flex-wrap gap-2" method="get">
        {["", "GOLD", "SILVER", "BRONZE"].map((c) => (
          <Link key={c} href={`/market?${new URLSearchParams({ ...(c ? { category: c } : {}), ...(sp.position ? { position: sp.position } : {}) })}`} className={`chip ${sp.category === c || (!c && !sp.category) ? "border-lime text-lime" : ""}`}>
            {c || "All tiers"}
          </Link>
        ))}
      </form>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
        {listings.map((l, i) => {
          const v = views[i];
          const mine = l.sellerId === user.id;
          return (
            <div key={l.id} className="flex flex-col items-center gap-2">
              <Link href={`/cards/${l.cardId}`}>
                <PlayerCard card={v} />
              </Link>
              <div className="text-center text-sm">
                <div className="text-lg font-black">{gbp(l.askingPriceMinor)}</div>
                <div className="text-[11px] text-faint">
                  asking · by {l.seller.displayName} · ends {relativeTime(l.expiresAt)}
                </div>
              </div>
              {mine ? (
                <ActionButton action={cancelListingAction.bind(null, l.id, l.cardId)} className="btn-ghost text-xs">
                  Cancel
                </ActionButton>
              ) : (
                <ActionButton action={buyListingAction.bind(null, l.id)} className="btn-primary text-xs">
                  Buy now
                </ActionButton>
              )}
            </div>
          );
        })}
      </div>
      {!listings.length && <p className="panel p-8 text-center text-muted">No active listings.</p>}
    </div>
  );
}
