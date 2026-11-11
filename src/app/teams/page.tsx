import Link from "next/link";
import { ClubBadge } from "@/components/club-badge";
import { teamsIndex } from "@/server/team-page";

export const metadata = {
  title: "Clubs",
  description: "Every English league club on MATCHX — collect your club's players as cards and score points from their real matches.",
};

export default async function TeamsPage() {
  const leagues = await teamsIndex();
  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">92 clubs · 4 leagues</p>
        <h1 className="mt-1 text-4xl leading-none sm:text-5xl">Find your club</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">Every player at every club in England&apos;s top four leagues is a MATCHX card. Pick your club to see its squad.</p>
      </div>
      {leagues.map((l) => (
        <section key={l.code}>
          <h2 className="mb-3 text-2xl">{l.name}</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {l.clubs.map((c) => (
              <li key={c.code}>
                <Link href={`/teams/${c.code.toLowerCase()}`} className="flex min-h-12 items-center gap-3 rounded-xl border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm font-semibold transition hover:border-ink-600 hover:bg-ink-850">
                  <ClubBadge short={c.shortName} primary={c.primaryColour} secondary={c.secondaryColour} kit={c.kit} crestUrl={c.crestUrl} size={22} title={c.name} />
                  <span className="min-w-0 truncate">{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
