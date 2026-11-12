import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { signupOpen } from "@/server/launch-gate";

export const metadata = { title: "Create account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ ref?: string; club?: string; email?: string; code?: string }> }) {
  const { ref, club, email, code } = await searchParams;
  if (await getCurrentUser()) redirect("/");
  // Pre-launch: sign-up is closed except with the early-access code — everyone else joins the waitlist.
  if (!(await signupOpen(code))) redirect(`/launch${club ? `?club=${encodeURIComponent(club)}` : ""}`);
  const leagues = await db.league.findMany({ orderBy: { tier: "asc" }, include: { clubs: { orderBy: { name: "asc" }, select: { code: true, name: true } } } });
  const clubs = leagues.map((l) => ({ league: l.name, clubs: l.clubs }));
  return (
    <div className="mx-auto grid max-w-4xl gap-10 pt-6 md:grid-cols-2">
      <div className="space-y-4">
        <p className="eyebrow">One account · every world</p>
        <h1 className="text-4xl font-black leading-tight">
          Your club starts with <span className="text-lime">32 free players.</span>
        </h1>
        <p className="text-muted">
          Every new manager gets 32 free players to start their MatchX journey, enough to enter this week&apos;s matches straight away, then a
          free booster every week.
        </p>
        <ul className="space-y-2 text-sm text-muted">
          <li>✓ A starting seven and a sub for each league: Premier League, Championship, League One and League Two</li>
          <li>✓ Get the app for 4 more: pick a top performer from each league, on loan for your first 4 gameweeks</li>
                    <li>✓ Score points from real match performances</li>
          <li>✓ Starter cards are yours to play with but can&apos;t be sold or traded</li>
        </ul>
      </div>
      <div className="panel p-6">
        <RegisterForm referrer={ref?.slice(0, 24)} clubs={clubs} club={clubs.some((l) => l.clubs.some((c) => c.code === club)) ? club : undefined} email={email?.slice(0, 200)} code={code?.slice(0, 32)} />
      </div>
    </div>
  );
}
