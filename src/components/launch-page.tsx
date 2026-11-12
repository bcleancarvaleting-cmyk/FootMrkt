import Link from "next/link";
import { cookies } from "next/headers";
import { ClubBadge } from "./club-badge";
import { CountdownBlocks } from "./countdown";
import { HeroBackground } from "./hero-background";
import { PlayerCard } from "./player-card";
import { WaitlistForm } from "./waitlist-form";
import type { WaitlistResult } from "@/app/actions/waitlist";
import { db } from "@/server/db";
import { getText } from "@/server/settings";
import { teamsIndex } from "@/server/team-page";
import { cardViews } from "@/server/views";
import { PLACES_PER_FRIEND, launchGiftName, waitlistCount, waitlistStatus } from "@/server/waitlist";

export type LaunchParams = { ref?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string; club?: string };

/** "YYYY-MM-DD HH:MM" in UK time → the moment it happens. */
export function ukDateTime(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(v.trim());
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 12), +(m[5] ?? 0));
  const london = new Date(new Date(asUtc).toLocaleString("en-US", { timeZone: "Europe/London" }));
  const utc = new Date(new Date(asUtc).toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(asUtc - (london.getTime() - utc.getTime()));
}

/**
 * The pre-launch front page: what MATCHX is, a countdown, and a one-step waitlist sign-up that
 * captures email, name, club, consent and where the visitor came from. Shown at /launch, and at
 * the homepage for logged-out visitors while Pre-launch is on.
 */
export async function LaunchPage({ sp }: { sp: LaunchParams }) {
  const tracking: LaunchParams = {
    ref: sp.ref?.slice(0, 16),
    utm_source: sp.utm_source?.slice(0, 60),
    utm_medium: sp.utm_medium?.slice(0, 60),
    utm_campaign: sp.utm_campaign?.slice(0, 80),
    club: sp.club?.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6),
  };
  const mineId = (await cookies()).get("mx_waitlist")?.value;
  const [showcase, leagues, count, gift, launchRaw, heroImage, players, mineStatus] = await Promise.all([
    cardViews(
      { template: { category: "GOLD", edition: "STANDARD", player: { club: { league: { isTopFlight: true } } } }, supplyState: { in: ["AVAILABLE", "RECIRCULATING"] }, serial: 1 },
      [{ template: { player: { squadNumber: "asc" } } }],
      12,
    ),
    teamsIndex(),
    waitlistCount(),
    launchGiftName(),
    getText("launchDate"),
    getText("homeHeroImage"),
    db.player.count({ where: { active: true } }),
    mineId && /^[0-9a-f-]{36}$/.test(mineId) ? waitlistStatus(mineId) : Promise.resolve(null),
  ]);
  const launchAt = launchRaw ? ukDateTime(launchRaw) : null;
  const fan = [showcase[3], showcase[0], showcase[7]].filter(Boolean);
  const clubs = leagues.map((l) => ({ league: l.name, clubs: l.clubs.map((c) => ({ code: c.code, name: c.name })) }));
  const invitedClub = tracking.club ? leagues.flatMap((l) => l.clubs).find((c) => c.code === tracking.club) : null;
  const mine: WaitlistResult | null = mineStatus ? { position: mineStatus.position, total: mineStatus.total, shareUrl: mineStatus.shareUrl, referrals: mineStatus.referrals, firstName: mineStatus.firstName, gift, again: true } : null;

  return (
    <div className="-mt-6 space-y-16">
      {/* Hero + sign-up */}
      <section className="relative -mx-4 overflow-hidden bg-[#0b0e0c] sm:-mx-6 lg:mx-0 lg:rounded-[28px]">
        <HeroBackground image={heroImage} />
        <div className="relative grid items-center gap-10 px-5 pb-10 pt-14 sm:px-10 lg:grid-cols-[1.1fr_1fr] lg:py-16">
          <div className="max-w-xl space-y-5 text-[#f4f5f2]">
            <span className="tag border-[#adfc07]/60 text-[#adfc07]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#adfc07]" aria-hidden="true" /> {launchAt ? "Kick-off is coming" : "Coming soon"}
            </span>
            <h1 className="text-[52px] leading-[0.86] sm:text-7xl">
              {invitedClub ? (
                <>
                  Calling all
                  <br />
                  <span className="text-[#adfc07]">{invitedClub.name} fans.</span>
                </>
              ) : (
                <>
                  Every club.
                  <br />
                  Every player.
                  <br />
                  <span className="text-[#adfc07]">One game.</span>
                </>
              )}
            </h1>
            <p className="max-w-md text-lg text-white/80">
              MATCHX is the football card game for all 92 English clubs. Collect real players, pick your seven and score points from what they do on the pitch every weekend.
            </p>
            {launchAt && <CountdownBlocks to={launchAt.toISOString()} />}
            <p className="flex items-center gap-2 text-sm text-white/80">
              <span className="flex -space-x-1.5" aria-hidden="true">
                {leagues[0]?.clubs.slice(0, 5).map((c) => (
                  <ClubBadge key={c.code} short={c.shortName} primary={c.primaryColour} secondary={c.secondaryColour} kit={c.kit} crestUrl={c.crestUrl} size={22} />
                ))}
              </span>
              <span>
                <b className="text-white tabular-nums">{count.toLocaleString("en-GB")}</b> manager{count === 1 ? " has" : "s have"} saved a place
              </span>
            </p>
          </div>
          <div id="join" className="scroll-mt-24 rounded-3xl border border-white/15 bg-[#0c0e10]/85 p-5 shadow-2xl backdrop-blur-xl sm:p-7">
            {!mine && (
              <div className="mb-4">
                <h2 className="text-3xl leading-none">Save your place</h2>
                <p className="mt-1 text-sm text-muted">Be first in when we open — and get <b className="text-lime">{gift}</b> free.</p>
                {tracking.ref && <p className="mt-2 rounded-lg border border-accent/40 bg-accent/5 px-3 py-1.5 text-xs">A friend invited you — joining moves you both up the queue.</p>}
              </div>
            )}
            <WaitlistForm clubs={clubs} tracking={tracking} gift={gift} perFriend={PLACES_PER_FRIEND} mine={mine} />
          </div>
        </div>
      </section>

      {/* Why join early */}
      <section>
        <p className="eyebrow text-lime">Join early</p>
        <h2 className="mt-1 text-4xl sm:text-5xl">What you get for waiting</h2>
        <ul className="mt-6 grid gap-3 md:grid-cols-3">
          {[
            ["🎁", `${gift}, free`, "Waiting in your Packs when you create your club with the email you sign up with."],
            ["⭐", "Founding Member badge", "Everyone who joins in the first wave gets a numbered Founding Member badge next to their name, forever."],
            ["🚀", "Jump the queue", `Share your link: every friend who joins moves you up ${PLACES_PER_FRIEND} places, so you're in before them.`],
          ].map(([icon, t, d]) => (
            <li key={t} className="panel p-5">
              <span className="text-3xl" aria-hidden="true">{icon}</span>
              <h3 className="mt-2 font-display text-2xl font-bold uppercase italic">{t}</h3>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* The game */}
      <section className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <p className="eyebrow text-lime">How it works</p>
          <h2 className="mt-1 text-4xl sm:text-5xl">Your club. Real football.</h2>
          <ol className="mt-6 space-y-4">
            {[
              ["Start with 32 free players", "A starting seven and a sub for the Premier League, Championship, League One and League Two, plus 4 top-performer picks when you get the app."],
              ["Pick your seven", "Choose a formation and your starters each gameweek. Real goals, assists, clean sheets and saves become your points."],
              ["Build your club", "Open packs, trade with other managers and chase the one-of-one Rainbow card of every player in England."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent font-display text-lg font-black italic text-accent-ink">{i + 1}</span>
                <span>
                  <b className="block">{t}</b>
                  <span className="text-sm text-muted">{d}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm text-faint">
            {players.toLocaleString("en-GB")} real players · 92 clubs · free to play · 18+
          </p>
        </div>
        {fan.length === 3 && (
          <div className="relative flex h-[360px] items-center justify-center overflow-hidden sm:h-[420px]" aria-hidden="true">
            {fan.map((c, i) => (
              <div key={c.id} className="absolute" style={{ transform: `translateX(${(i - 1) * 120}px) translateY(${i === 1 ? -8 : 20}px) rotate(${(i - 1) * 9}deg)`, zIndex: i === 1 ? 2 : 1 }}>
                <PlayerCard card={c} size={i === 1 ? "lg" : "md"} showcase />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Find your club */}
      <section>
        <p className="eyebrow text-lime">All 92 clubs</p>
        <h2 className="mt-1 text-4xl sm:text-5xl">Find your club</h2>
        <p className="mt-2 max-w-xl text-sm text-muted">Every player at every club in England&apos;s top four leagues is a MATCHX card. See your club&apos;s squad.</p>
        <ul className="mt-5 flex flex-wrap gap-2">
          {leagues.flatMap((l) => l.clubs).map((c) => (
            <li key={c.code}>
              <Link href={`/teams/${c.code.toLowerCase()}`} title={c.name} className="flex h-11 w-11 items-center justify-center rounded-xl border border-ink-700 bg-ink-900 transition hover:-translate-y-0.5 hover:border-accent/60">
                <ClubBadge short={c.shortName} primary={c.primaryColour} secondary={c.secondaryColour} kit={c.kit} crestUrl={c.crestUrl} size={24} title={c.name} />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Final call */}
      <section className="relative overflow-hidden rounded-[28px] border border-ink-700 bg-ink-900 px-6 py-14 text-center">
        <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-[70%] rounded-full bg-accent/20 blur-3xl" aria-hidden="true" />
        <h2 className="relative text-5xl sm:text-6xl">Don&apos;t miss kick-off</h2>
        <p className="relative mx-auto mt-3 max-w-md text-muted">One email when we open. Your free players and {gift} will be waiting.</p>
        <a href="#join" className="btn-primary relative mt-6 px-8 py-4 text-sm">{mine ? "See my place" : "Save my place"}</a>
        <p className="relative mt-4 text-xs text-faint">
          Already testing with us? <Link href="/login" className="underline">Log in</Link>. 18+ only. Your MATCHX balance is spend-only, not an investment.
        </p>
      </section>
    </div>
  );
}
