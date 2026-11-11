import Link from "next/link";
import { FINISH_STYLE, type Finish, Gem } from "@/components/finish-art";
import { LOAN_PICK_CODE } from "@/config/packs";
import { db } from "@/server/db";
import { notFound } from "next/navigation";
import { PackReveal } from "@/components/pack-reveal";
import { SharePack } from "@/components/share-pack";
import { referralRewardName } from "@/server/settings";
import { requireUser } from "@/server/auth/session";
import { DomainError } from "@/server/errors";
import { getOpening } from "@/server/packs";
import { enrichCards } from "@/server/views";

export const metadata = { title: "Pack opening" };

export default async function OpeningPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const opening = await getOpening(user.id, id).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  const cards = await enrichCards(opening.cards.map((c) => c.card));
  const counts = { GOLD: 0, SILVER: 0, BRONZE: 0 };
  for (const c of cards) counts[c.category]++;
  const isStarter = opening.packSku.kind === "STARTER";
  // The rarest finish in the pack takes the headline.
  const best = cards.map((c) => c.finish?.kind).filter((k): k is Finish => !!k).sort((a, b) => FINISH_STYLE[b].rank - FINISH_STYLE[a].rank)[0] ?? null;
  const isLoan = opening.packSku.code === LOAN_PICK_CODE;
  // Straight after the Starter Pack: the two loan Golds are the next step.
  const loanPick = isStarter
    ? await db.packEntitlement.findFirst({ where: { userId: user.id, status: "UNOPENED", packSku: { code: LOAN_PICK_CODE } }, select: { id: true } })
    : null;
  return (
    <div className="space-y-8">
      <div className="text-center">
        <p className="eyebrow">{opening.packSku.name}</p>
        <h1 className="mt-1 flex items-center justify-center gap-3 text-5xl font-extrabold">
          {best && <Gem kind={best} id="headline" size={52} className={FINISH_STYLE[best].shadow} />}
          {best ? <span className={FINISH_STYLE[best].name}>{best === "RAINBOW" ? "ONE OF ONE!" : `${FINISH_STYLE[best].label.toUpperCase()}!`}</span> : counts.GOLD > 0 ? `${counts.GOLD} Gold!` : counts.SILVER > 0 ? `${counts.SILVER} Silver` : "Your new cards"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {cards.length} card{cards.length === 1 ? "" : "s"} added to your club
          {isStarter && " · Starter cards are locked to your account and can't be traded"}
          {isLoan && ` · on loan for the first ${cards[0]?.loan?.total ?? 4} gameweeks you enter`}
        </p>
      </div>
      <PackReveal cards={cards} />
      <div className="flex flex-wrap justify-center gap-3">
        {loanPick ? (
          <Link href={`/packs/pick/${loanPick.id}`} className="btn-gold px-6 py-3">
            Next: sign 2 Gold players on loan →
          </Link>
        ) : isStarter || isLoan ? (
          <Link href="/matches" className="btn-primary px-6 py-3">
            Pick your first squad →
          </Link>
        ) : (
          <Link href="/account/club" className="btn-primary">
            Send to club
          </Link>
        )}
        <Link href="/packs" className="btn-ghost">
          Back to packs
        </Link>
        {(best || counts.GOLD > 0) && (
          <Link href={`/packs/opening/${opening.id}/share`} className={best ? "btn-diamond px-6 py-3" : "btn-gold px-6 py-3"}>
            📸 Share your pull
          </Link>
        )}
      </div>
      <SharePack openingId={opening.id} rewardName={await referralRewardName()} />
    </div>
  );
}
