import Link from "next/link";
import { notFound } from "next/navigation";
import { PickChooser } from "@/components/pick-chooser";
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
  const { keep, options, loanGameweeks } = data.pick;
  const tier = data.category.toLowerCase();
  const leagues = [...new Set(data.cards.map((c) => c.leagueName).filter(Boolean))].join(" and ") || "top-flight";
  return (
    <div className="space-y-8 text-center">
      <div>
        <p className="eyebrow">{data.entitlement.packSku.name}</p>
        {loanGameweeks ? (
          <>
            <h1 className="mt-1 text-5xl">Sign {keep} on loan</h1>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted">
              Choose {keep} of these {options} {leagues} {tier} players, picked at random just for you. They play for your squad in the first {loanGameweeks} gameweeks you enter, then go back
              to their clubs. Loan players are free, untradeable and have no value — they can&apos;t be sold or handed in.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-1 text-5xl">Choose your {tier}</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              Keep {keep === 1 ? "one" : keep} of these {options} players, chosen at random for this pack. The others go back. Free cards are untradeable, and count in challenges and freerolls.
            </p>
          </>
        )}
      </div>
      {data.opened ? (
        <p className="text-muted">
          You&apos;ve already made this pick. <Link href="/account/club" className="text-lime underline">See My Club</Link>
        </p>
      ) : (
        <PickChooser entitlementId={id} cards={data.cards} keep={keep} verb={loanGameweeks ? "Sign on loan:" : "Keep"} />
      )}
    </div>
  );
}
