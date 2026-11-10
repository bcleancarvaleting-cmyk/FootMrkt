import Link from "next/link";
import { notFound } from "next/navigation";
import { ChallengePicker } from "@/components/challenge-picker";
import { requireUser } from "@/server/auth/session";
import { eligibleCards } from "@/server/challenges";
import { DomainError } from "@/server/errors";
import { fmtMp } from "@/server/wallet";

export const metadata = { title: "Challenge" };

export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const data = await eligibleCards(user.id, id).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  const { challenge: c, cards } = data;
  return (
    <div>
      <Link href="/account/challenges" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted hover:text-fg">← Challenges</Link>
      <h1 className="mt-2 text-4xl leading-none sm:text-5xl">{c.name}</h1>
      <p className="mt-2 text-sm text-muted">{c.description}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-faint">
        {c.summary} · reward {[c.rewardMinor > 0 ? fmtMp(c.rewardMinor) : null, c.rewardPackSku ? "pack" : null].filter(Boolean).join(" + ")}
      </p>
      <div className="mt-6">
        <ChallengePicker challengeId={c.id} count={c.criteria.count} maxPerClub={c.criteria.maxPerClub ?? null} cards={cards} />
      </div>
    </div>
  );
}
