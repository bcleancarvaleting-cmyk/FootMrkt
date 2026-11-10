import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayerCard } from "@/components/player-card";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { CARD_INCLUDE, enrichCards } from "@/server/views";

export const metadata = { title: "Signed!" };

/** After buying a player: a pack-style reveal, then send to club or put on the transfer list. */
export default async function SignedPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const listing = await db.marketListing.findUnique({ where: { id }, include: { card: { include: CARD_INCLUDE } } });
  if (!listing || listing.buyerId !== user.id) notFound();
  const [card] = await enrichCards([listing.card]);
  const tradeable = listing.card.tradeStatus === "TRADEABLE" && listing.card.ownerId === user.id;
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <p className="eyebrow text-lime">Signed</p>
      <h1 className="text-5xl leading-none">{card.finish ? `${card.finish.kind === "DIAMOND" ? "Diamond" : "Ruby"} ${card.finish.serial} of ${card.finish.of}!` : "Welcome to your club"}</h1>
      {card.finish && (
        <p className={`text-sm ${card.finish.kind === "DIAMOND" ? "text-[#8fe3ff]" : "text-[#ff8fa6]"}`}>
          Your signing came out as a {card.finish.kind === "DIAMOND" ? "Diamond" : "Ruby"}: one of only {card.finish.of === 5 ? "five" : "ten"} that will ever exist.
        </p>
      )}
      <div className="reveal">
        <PlayerCard card={card} size="lg" />
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/account/club" className="btn-primary px-6">
          Send to club
        </Link>
        {tradeable ? (
          <Link href={`/cards/${card.id}#sell`} className="btn-ghost px-6">
            Transfer list
          </Link>
        ) : (
          <span className="btn-ghost cursor-not-allowed px-6 opacity-50" title="Cards signed during the beta can't be resold">
            Transfer list
          </span>
        )}
      </div>
      {!tradeable && <p className="text-xs text-faint">Players signed before paid packs launch are yours to keep and play, but can&apos;t be resold.</p>}
    </div>
  );
}
