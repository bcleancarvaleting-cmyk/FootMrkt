import Link from "next/link";
import { CreateLeagueForm, JoinLeagueForm } from "@/components/league-forms";
import { EmptyState, PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth/session";
import { myLeagues } from "@/server/leagues";

export const metadata = { title: "Mini-leagues" };

export default async function LeaguesPage() {
  const user = await requireUser();
  const leagues = await myLeagues(user.id);
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Play with your mates" title="Mini-leagues" intro="Make a private league for your friends, work or five-a-side team. Everyone's best score each gameweek counts, all season long." />
      <section className="grid gap-4 md:grid-cols-2">
        <div className="panel p-5">
          <h2 className="mb-3 text-2xl">Start a league</h2>
          <CreateLeagueForm />
        </div>
        <div className="panel p-5">
          <h2 className="mb-3 text-2xl">Join with a code</h2>
          <JoinLeagueForm />
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-2xl">Your leagues</h2>
        {leagues.length === 0 ? (
          <EmptyState title="No leagues yet">Start one and share the code, or ask a friend for theirs.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {leagues.map((l) => (
              <li key={l.id}>
                <Link href={`/leagues/${l.id}`} className="row-item">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-xl font-bold uppercase italic">{l.name}</span>
                    <span className="block text-xs text-muted">
                      {l.members} manager{l.members === 1 ? "" : "s"} · code <b className="tracking-widest">{l.code}</b>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Your position</span>
                    <span className="font-display text-2xl font-black tabular-nums">{l.rank ? `#${l.rank}` : "–"}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
