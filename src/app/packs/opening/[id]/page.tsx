import Link from "next/link";
import { notFound } from "next/navigation";
import { PackReveal } from "@/components/pack-reveal";
import { requireUser } from "@/server/auth/session";
import { DomainError } from "@/server/errors";
import { getOpening } from "@/server/packs";
import { latestValues, valueKey } from "@/server/valuation";
import { toCardView } from "@/lib/view";

export const metadata = { title: "Pack opening" };

export default async function OpeningPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const opening = await getOpening(user.id, id).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  const values = await latestValues(opening.cards.map((c) => ({ playerId: c.card.template.playerId, category: c.card.template.category })));
  const cards = opening.cards.map((c) => toCardView(c.card, { valueMp: values.get(valueKey(c.card.template.playerId, c.card.template.category)) ?? null }));
  const counts = { GOLD: 0, SILVER: 0, BRONZE: 0 };
  for (const c of cards) counts[c.category]++;
  const isStarter = opening.packSku.kind === "STARTER";
  return (
    <div className="space-y-8">
      <div className="text-center">
        <p className="eyebrow">{opening.packSku.name}</p>
        <h1 className="mt-1 text-3xl font-black">
          {counts.GOLD > 0 ? `${counts.GOLD} Gold!` : counts.SILVER > 0 ? `${counts.SILVER} Silver` : "Your new cards"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {cards.length} cards added to your Binder
          {isStarter && " · Starter cards are locked to your account and can't be traded"}
        </p>
      </div>
      <PackReveal cards={cards} />
      <div className="flex flex-wrap justify-center gap-3">
        {isStarter ? (
          <Link href="/football" className="btn-primary px-6 py-3">
            Pick your first squad →
          </Link>
        ) : (
          <Link href="/binder" className="btn-primary">
            View Binder
          </Link>
        )}
        <Link href="/packs" className="btn-ghost">
          Back to packs
        </Link>
      </div>
    </div>
  );
}
