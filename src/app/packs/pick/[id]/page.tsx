import Link from "next/link";
import { notFound } from "next/navigation";
import { PickButton } from "@/components/pick-button";
import { PlayerCard } from "@/components/player-card";
import { requireUser } from "@/server/auth/session";
import { DomainError } from "@/server/errors";
import { pickOptions } from "@/server/picks";

export const metadata = { title: "Choose your player" };

export default async function PickPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const data = await pickOptions(user.id, id).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  return (
    <div className="space-y-8 text-center">
      <div>
        <p className="eyebrow">{data.entitlement.packSku.name}</p>
        <h1 className="mt-1 text-5xl">Choose your {data.category.toLowerCase()}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">Keep one of these three players, chosen at random for this pack. The other two go back. Free cards are untradeable, and count in challenges and freerolls.</p>
      </div>
      {data.opened ? (
        <p className="text-muted">
          You&apos;ve already made this pick. <Link href="/account/club" className="text-lime underline">See My Club</Link>
        </p>
      ) : (
        <div className="flex flex-wrap items-start justify-center gap-6">
          {data.cards.map((c) => (
            <div key={c.playerId} className="flex flex-col items-center gap-3">
              <PlayerCard card={{ ...c, acquired: null, pointsForYou: null }} size="lg" />
              <PickButton entitlementId={id} playerId={c.playerId} name={c.name} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
