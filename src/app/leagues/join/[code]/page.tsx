import Link from "next/link";
import { JoinLeagueForm } from "@/components/league-forms";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/server/auth/session";
import { leagueByCode } from "@/server/leagues";

export const metadata = { title: "Join a mini-league" };

export default async function JoinLeaguePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [user, league] = await Promise.all([getCurrentUser(), leagueByCode(code.slice(0, 6))]);
  return (
    <div className="mx-auto max-w-lg space-y-6 text-center">
      <PageHeader eyebrow="You've been invited" title={league ? league.name : "League not found"} intro={league ? `${league._count.members} manager${league._count.members === 1 ? "" : "s"} so far. Join and compete every gameweek.` : "That code doesn't match a league. Check it with whoever sent it."} />
      {league &&
        (user ? (
          <div className="panel p-5 text-left">
            <JoinLeagueForm code={league.code} />
          </div>
        ) : (
          <Link href="/register" className="btn-primary px-8 py-4">
            Join MATCHX free to play
          </Link>
        ))}
    </div>
  );
}
