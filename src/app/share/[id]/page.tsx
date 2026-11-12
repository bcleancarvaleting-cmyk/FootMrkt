import Link from "next/link";
import { ClubCrest } from "@/components/club-crest";
import { notFound } from "next/navigation";
import { PlayerCard } from "@/components/player-card";
import { packHeadline, publicOpening } from "@/server/share";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await publicOpening(id);
  if (!o) return { title: "MATCHX" };
  const title = `${o.manager} opened a ${o.pack}: ${packHeadline(o.cards)}`;
  return { title, description: "Collect real English footballers, pick your seven and score from real matches. Play free.", openGraph: { title, type: "website" }, robots: { index: false } };
}

/** Public page for a shared pack opening (linked from Facebook). */
export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await publicOpening(id);
  if (!o) notFound();
  return (
    <div className="space-y-8 py-6 text-center">
      <div className="flex flex-col items-center gap-3">
        {o.crest && <ClubCrest crest={o.crest} id="share" size={72} title={o.clubName ?? `${o.manager}'s club`} />}
        <p className="eyebrow">
          {o.clubName ? `${o.clubName} · ` : ""}
          {o.pack}
        </p>
        <h1 className="mt-1 text-5xl leading-none">
          {o.manager} pulled <span className="text-lime">{packHeadline(o.cards)}</span>
        </h1>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {o.cards.map((c) => (
          <PlayerCard key={c.id} card={c} size="sm" />
        ))}
      </div>
      <div className="flex flex-col items-center gap-2">
        <Link href={`/register?ref=${encodeURIComponent(o.manager)}`} className="btn-primary px-8 py-4 text-sm">
          Play free — 32 players + 4 app picks
        </Link>
        <p className="text-sm text-muted">Join with {o.manager}&apos;s invite and start with 14 free players, plus 2 Premier League Golds on loan.</p>
        <p className="text-xs text-faint">Real English footballers · 32 free players to start · 18+</p>
      </div>
    </div>
  );
}
