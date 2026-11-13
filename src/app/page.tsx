import Link from "next/link";
import { PlayerFace } from "@/components/player-face";
import { TeamOfTheWeek } from "@/components/totw";
import { currentTeamOfTheWeek } from "@/server/totw";
import { PredictionButtons } from "@/components/daily-panel";
import { LevelBadge } from "@/components/level-badge";
import { PREDICTION_XP, predictionPanel } from "@/server/predictions";
import { managerLevel } from "@/server/progression";
import { CardRow } from "@/components/card-row";
import { Countdown } from "@/components/countdown";
import { PlayerCard } from "@/components/player-card";
import { ClubBadge } from "@/components/club-badge";
import { MatchCard } from "@/components/match-card";
import { Sparkline } from "@/components/card-row";
import { LaunchPage, type LaunchParams } from "@/components/launch-page";
import { HeroCarousel } from "@/components/hero-carousel";
import { HubHero } from "@/components/hub-hero";
import { HeroSlide } from "@/components/hero-slide";
import { MoversPanel } from "@/components/movers-panel";
import { PackWrapper } from "@/components/pack-wrapper";
import { starCards } from "@/server/showcase";
import { LiveGamesList } from "@/components/live-games-list";
import { PromoBanner } from "@/components/promo-banner";
import { PhotoBackground } from "@/components/hero-background";
import { TakeItOnTheGo } from "@/components/app-install";
import { CommunityLinks } from "@/components/community-links";
import { EndedLoansBanner } from "@/components/loan-banner";
import { RowStat } from "@/components/card-row";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { activeDrop, giftLabel } from "@/server/drops";
import { isEnabled } from "@/server/flags";
import { currentGameweek } from "@/server/gameweeks";
import { performanceTable } from "@/server/top-performers";
import { cardViews } from "@/server/views";
import { fmtDate } from "@/lib/view";

export default async function Home({ searchParams }: { searchParams: Promise<LaunchParams> }) {
  const user = await getCurrentUser();
  if (user) return <Hub userId={user.id} name={user.displayName} />;
  // Pre-launch: logged-out visitors get the waitlist page.
  if (await isEnabled("PRELAUNCH")) return <LaunchPage sp={await searchParams} />;
  return <Landing />;
}

async function Landing() {
  // Front page: the game's best-known players, the real packs and what's on now.
  const { heroCardLooks, dress, heroPhotos } = await import("@/server/site-images");
  const [looks, photos] = await Promise.all([heroCardLooks(), heroPhotos()]);
  const [stars, marketStars, packSkus, players, clubs, chosen] = await Promise.all([
    starCards("GOLD", 3),
    starCards("GOLD", 7).then((c) => c.slice(3, 7)),
    db.packSku.findMany({ where: { code: { in: ["football-eng-bronze", "football-eng-silver", "football-eng-gold"] } }, select: { code: true, priceMinor: true } }),
    db.player.count({ where: { active: true } }),
    db.club.count(),
    // The homepage cards picked in Admin → Images (No. 1 Gold of each, in the chosen look).
    (await import("@/server/views")).cardViews({ serial: 1, finish: null, template: { category: "GOLD", edition: "STANDARD", player: { displayName: { in: looks.map((l) => l.name) } } } }, undefined, 10),
  ]);
  const picked = looks.flatMap((l) => {
    const c = chosen.find((x) => x.name === l.name);
    return c ? [dress(c, l.look)] : [];
  });
  const picks = picked.length === 3 ? picked : stars.length === 3 ? [stars[1], stars[0], stars[2]] : stars;
  const packLeagues = await (await import("@/server/pack-leagues")).packLeagueBadges(["football-eng-bronze", "football-eng-silver", "football-eng-gold"]).catch(() => ({}) as Record<string, never[]>);
  const priceOf = (t: string) => {
    const sku = packSkus.find((k) => k.code === `football-eng-${t}`);
    return sku ? `£${(sku.priceMinor / 100).toFixed(2)}` : undefined;
  };
  const ctas = [
    { href: "/register", label: "Play free — 32 players + 4 app picks" },
    { href: "/how-it-works", label: "How it works", tone: "ghost" as const },
  ];

  return (
    <div className="-mt-6 space-y-14">
      {/* Hero: swipe between the three things you do on MATCHX — title first on every slide */}
      <div className="-mx-4 sm:-mx-6 lg:mx-0">
        <HeroCarousel labels={["Manage your team", "Transfer market", "Buy packs"]}>
          <HeroSlide
            heading="h1"
            background={<PhotoBackground src={photos.floodlight} position="50% 40%" />}
            eyebrow="Manage your team"
            title="Your club"
            accent="starts here."
            body="Pick seven real English footballers, choose a formation and score points from what they do on the pitch every weekend."
            points={["2-2-2, 2-3-1, 3-2-1 or 3-1-2", "A sub comes on if a starter doesn't play", "Free matches every gameweek, with £ prizes"]}
            visual={
              <div className="relative flex h-[300px] w-full items-center justify-center sm:h-[380px]">
                {picks.map((c, i) => (
                  <div key={c.id} className="absolute" style={{ transform: `translateX(${(i - 1) * 118}px) translateY(${i === 1 ? -6 : 20}px) rotate(${(i - 1) * 8}deg) scale(${i === 1 ? 1 : 0.86})`, zIndex: i === 1 ? 2 : 1 }}>
                    <PlayerCard card={c} size="md" showcase />
                  </div>
                ))}
              </div>
            }
            ctas={ctas}
          />
          <HeroSlide
            background={<PhotoBackground src={photos.nightStadium} />}
            eyebrow="Transfer market"
            title="Buy, sell &"
            accent="make offers."
            body="Trade players with other managers using credit you've earned from XP, challenges and sales. See every player's value graph before you buy."
            points={["Earn XP from every point your players score", "Turn XP into £ credit to spend", "Auctions, offers and buy-it-now"]}
            visual={
              <ul className="w-full max-w-lg space-y-2 text-left">
                {marketStars.map((c) => (
                  <CardRow key={c.id} card={c} find={false} href="/register">
                    <RowStat label="Buy now" className="w-20">
                      <span className="text-lime">£{(c.valueMp ?? 1).toFixed(2)}</span>
                    </RowStat>
                  </CardRow>
                ))}
              </ul>
            }
            ctas={ctas}
          />
          <HeroSlide
            background={<PhotoBackground src={photos.ballBoots} position="60% 50%" />}
            eyebrow="Buy packs"
            title="Pack"
            accent="luck."
            body="Start with 32 free players across all four leagues, plus 4 top-performer picks in the app and a free booster every week. Then rip England Bronze, Silver and Gold packs."
            points={["Every card a numbered copy of a real player", "Published odds on every pack", "Rare Ruby, Diamond and 1-of-1 Rainbow cards"]}
            visual={
              <div className="flex items-end justify-center gap-3 pb-4 sm:gap-5">
                {(["bronze", "silver", "gold"] as const).map((t, i) => (
                  <PackWrapper key={t} tier={t} price={priceOf(t)} leagues={packLeagues[`football-eng-${t}`]} className="h-48 w-[100px] sm:h-64 sm:w-36" style={{ transform: `translateY(${i === 2 ? -18 : i === 1 ? -6 : 0}px) rotate(${(i - 1) * 4}deg)` }} />
                ))}
              </div>
            }
            ctas={ctas}
          />
        </HeroCarousel>
      </div>

      {/* A taste of the game: what's on now and who's moving */}
      <LiveGamesList userId={null} />
      <MoversPanel n={3} open guest />

      {/* Proof bar */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-700 bg-ink-700 sm:grid-cols-4">
        {[
          [players.toLocaleString("en-GB"), "real players"],
          [String(clubs), "English clubs"],
          ["5", "divisions"],
          ["£0", "to start"],
        ].map(([v, l]) => (
          <div key={l} className="bg-ink-900 px-5 py-6">
            <p className="font-display text-4xl font-extrabold italic tabular-nums">{v}</p>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{l}</p>
          </div>
        ))}
      </section>

      {/* How it works */}
      <section>
        <p className="eyebrow">How it works</p>
        <h2 className="mt-1 text-5xl">Three steps to matchday</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ["01", "Open packs", "Start with 32 free players across all four leagues (36 with the app), then a free booster every week. Every card is a numbered copy of a real player — Bronze, Silver or Gold by real market value."],
            ["02", "Pick your seven", "Choose a formation, a keeper, defenders, midfielders and attackers, plus a sub who comes on if a starter doesn't play."],
            ["03", "Score real points", "Goals, assists, clean sheets and saves from real games become your points. Top the table, win packs."],
          ].map(([n, t, d]) => (
            <li key={n} className="panel relative overflow-hidden p-6">
              <span className="absolute -right-2 -top-6 font-display text-[120px] font-extrabold italic leading-none text-ink-800" aria-hidden="true">{n}</span>
              <h3 className="relative font-display text-3xl font-bold uppercase italic">{t}</h3>
              <p className="relative mt-2 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Feature rows */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Feature eyebrow="Transfers" title="Buy, sell, make offers" body="Trade cards with other managers in MX. See the average selling price and the all-time value graph before you buy. Plus daily player drops: new players released by MATCHX, never found in packs." href="/register" cta="Start trading" />
        <Feature eyebrow="Challenges" title="Keep your squad moving" body="Hand in cards you don't need for £ credit and packs. They go back into the packs for someone else to pull." href="/register" cta="See challenges" />
        <Feature eyebrow="Matches" title="Every gameweek, a new table" body="Open leagues, Bronze-only cups and more. Squads lock 10 minutes before the first kick-off." href="/register" cta="Enter a match" />
        <Feature eyebrow="Free packs" title="Drop days" body="We drop free packs on big matchdays. Claim within 24 hours — keep an eye on the Packs page." href="/register" cta="Join free" />
      </section>

      <CommunityLinks />

      <TakeItOnTheGo />

      {/* Final CTA */}
      <section className="relative overflow-hidden rounded-[28px] border border-ink-700 bg-ink-900 px-6 py-14 text-center">
        <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-[70%] rounded-full bg-accent/20 blur-3xl" aria-hidden="true" />
        <h2 className="relative text-5xl sm:text-6xl">Kick off for free</h2>
        <p className="relative mx-auto mt-3 max-w-md text-muted">Sign up in a minute and open your Starter Pack straight away.</p>
        <Link href="/register" className="btn-primary relative mt-6 px-8 py-4 text-sm">
          Create my club
        </Link>
        <p className="relative mt-4 text-xs text-faint">Player values go up and down. Your MATCHX balance is spend-only, not an investment.</p>
      </section>
    </div>
  );
}

function Feature({ eyebrow, title, body, href, cta }: { eyebrow: string; title: string; body: string; href: string; cta: string }) {
  return (
    <div className="panel flex flex-col p-6">
      <p className="eyebrow text-lime">{eyebrow}</p>
      <h3 className="mt-2 font-display text-3xl font-bold uppercase italic">{title}</h3>
      <p className="mt-2 flex-1 text-sm text-muted">{body}</p>
      <Link href={href} className="mt-5 self-start text-xs font-bold uppercase tracking-[0.14em] text-lime hover:underline">
        {cta} →
      </Link>
    </div>
  );
}

async function Hub({ userId, name }: { userId: string; name: string }) {
  const [gw, unopened, recent, drop, playerDrops, marketOn, top, level, streak, prediction, auctions] = await Promise.all([
    currentGameweek(),
    db.packEntitlement.count({ where: { userId, status: "UNOPENED" } }),
    cardViews({ ownerId: userId, supplyState: "HELD" }, [{ updatedAt: "desc" }], 5),
    activeDrop(),
    db.marketListing.count({ where: { house: true, status: "ACTIVE", liveAt: { lte: new Date() }, card: { packable: false } } }),
    isEnabled("MARKET"),
    performanceTable({ window: "last" }),
    managerLevel(userId),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { loginStreak: true, bestStreak: true } }),
    predictionPanel(userId),
    db.auction.count({ where: { status: "LIVE" } }),
  ]);
  const totw = await currentTeamOfTheWeek();
  const [comps, paidEntry] = await Promise.all([
    gw
      ? db.competition.findMany({ where: { gameweekId: gw.id }, include: { entries: { where: { userId } }, _count: { select: { entries: true } } }, orderBy: [{ entryFeeMinor: "asc" }, { name: "asc" }] })
      : [],
    isEnabled("PAID_ENTRY"),
  ]);
  const watch = await (await import("@/server/watch")).watchable();
  const promo = await (await import("@/server/promo")).promoState(userId);

  return (
    <div className="space-y-8">
      <PromoBanner {...promo} />
      <HubHero userId={userId} name={name} unopened={unopened} marketOn={marketOn} buyNows={playerDrops} auctions={auctions} watch={watch} />

      <LiveGamesList userId={userId} />

      <EndedLoansBanner userId={userId} />

      {/* Level · daily streak · today's prediction */}
      <section className="grid gap-3 md:grid-cols-3">
        <Link href="/account/achievements" className="block">
          <LevelBadge level={level} />
        </Link>
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <p className="eyebrow">Daily streak</p>
          <p className="mt-1 font-display text-3xl font-black">
            {streak.loginStreak} day{streak.loginStreak === 1 ? "" : "s"} <span aria-hidden="true">🔥</span>
          </p>
          <div className="mt-2 flex gap-1" aria-label={`${streak.loginStreak % 7 || (streak.loginStreak ? 7 : 0)} of 7 days to a free pack`}>
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i < (streak.loginStreak % 7 || (streak.loginStreak ? 7 : 0)) ? "bg-[var(--color-chart)]" : "bg-ink-800"}`} />
            ))}
          </div>
          <p className="mt-1 text-[11px] text-faint">Log in every day for XP · every 7th day a free Choice of Bronze · best {streak.bestStreak}</p>
        </div>
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <p className="eyebrow">Daily prediction · +{PREDICTION_XP} XP</p>
          {prediction.question ? (
            <>
              <p className="mt-1 font-semibold">{prediction.question.question}</p>
              <p className="mb-2 text-[11px] text-faint">Locks {fmtDate(prediction.question.locksAt)}</p>
              <PredictionButtons questionId={prediction.question.id} initial={prediction.mine?.guess ?? null} locked={prediction.question.locksAt <= new Date()} tally={prediction.tally} />
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">No matches coming up — the next question appears with the next fixtures.</p>
          )}
        </div>
      </section>

      {drop && (
        <Link href="/packs" className="drop-glow flex items-center gap-4 rounded-2xl border border-accent/70 bg-ink-900 px-4 py-3">
          <span className="live-dot" aria-hidden="true" />
          <span className="flex-1 font-semibold">
            Free gift: {drop.title} <span className="text-lime">· {giftLabel(drop)}</span>
          </span>
          <Countdown to={drop.endsAt.toISOString()} className="text-sm font-bold" />
          <span className="text-lime">→</span>
        </Link>
      )}


      {comps.length > 0 && (
        <section>
          <SectionHead eyebrow={gw ? `Gameweek ${gw.number}` : "Matches"} title="This gameweek" href="/matches" cta="All matches" />
          <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-3">
            {comps.map((c) => (
              <li key={c.id} className="w-[86%] shrink-0 snap-start md:w-auto">
                <MatchCard c={c} entry={c.entries[0]} paidEntry={paidEntry} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {totw && <TeamOfTheWeek totw={totw} link />}

      {top.length > 0 && (
        <section>
          <SectionHead eyebrow="Last gameweek" title="Top performers" href="/top-performers" cta="All rankings" />
          <ol className="grid grid-cols-3 items-end gap-2 sm:gap-4">
            {[top[1], top[0], top[2]].map((r, i) =>
              r ? (
                <li key={r.playerId}>
                  <Link
                    href={`/players/${r.playerId}`}
                    className={`relative flex flex-col items-center overflow-hidden rounded-2xl border bg-ink-900 px-2 pb-4 text-center transition hover:-translate-y-0.5 ${i === 1 ? "border-gold/70 pt-6 shadow-[0_16px_50px_-20px_rgba(240,203,90,0.55)]" : "border-ink-700 pt-4"}`}
                  >
                    <span className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-30" style={{ background: `radial-gradient(70% 100% at 50% 0%, ${r.clubPrimary}, transparent)` }} aria-hidden="true" />
                    <span className={`relative font-display text-sm font-black ${i === 1 ? "text-gold" : i === 0 ? "text-silver" : "text-bronze"}`}>{i === 1 ? "1st" : i === 0 ? "2nd" : "3rd"}</span>
                    <PlayerFace imageUrl={r.imageUrl} kit={r.kit} number={r.squadNumber} id={`top-${r.playerId}`} label={r.name} size={i === 1 ? "h-16 sm:h-20" : "h-12 sm:h-16"} className="relative mt-1" />
                    <span className="relative mt-2 line-clamp-2 font-display text-sm font-bold uppercase leading-tight sm:text-lg">{r.name}</span>
                    <span className="relative mt-0.5 flex max-w-full items-center gap-1 text-[10px] text-muted sm:text-xs">
                      <ClubBadge short={r.clubShort} primary={r.clubPrimary} secondary={r.clubSecondary} kit={r.kit} size={12} title={r.club ?? undefined} />
                      <span className="truncate">{r.clubShort ?? r.club}</span>
                    </span>
                    <span className={`relative mt-2 font-display font-black tabular-nums leading-none ${i === 1 ? "text-4xl text-lime sm:text-5xl" : "text-3xl"}`}>{r.points}</span>
                    <span className="relative text-[10px] font-bold uppercase tracking-[0.16em] text-faint">pts</span>
                  </Link>
                </li>
              ) : (
                <li key={i} />
              ),
            )}
          </ol>
          {top.length > 3 && (
            <ol start={4} className="mt-3 divide-y divide-ink-700 overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
              {top.slice(3, 8).map((r, i) => (
                <li key={r.playerId}>
                  <Link href={`/players/${r.playerId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-ink-850">
                    <span className="w-5 text-center font-display text-base font-black text-muted">{i + 4}</span>
                    <PlayerFace imageUrl={r.imageUrl} kit={r.kit} number={r.squadNumber} id={`top-row-${r.playerId}`} label={r.name} size="h-9" className="shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{r.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {r.position} · {r.club} · {r.leagueName}
                      </span>
                    </span>
                    {r.byGameweek.length > 1 && <Sparkline points={r.byGameweek} width={56} height={20} />}
                    <span className="w-12 text-right font-display text-xl font-black tabular-nums">{r.points}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <CommunityLinks />

      <TakeItOnTheGo />

      {recent.length > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-3xl">Latest signings</h2>
            <Link href="/account/club" className="text-xs font-bold uppercase tracking-[0.14em] text-lime">My Club →</Link>
          </div>
          <ul className="space-y-1.5">
            {recent.map((c) => (
              <CardRow key={c.id} card={c} href={`/cards/${c.id}`} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * Hero photo: the one set in Admin → Settings, else Wembley's arch at night (Martin Pettitt,
 * CC BY 2.0 — credited on the photo and in Legal → credits).
 */
function SectionHead({ eyebrow, title, href, cta }: { eyebrow: string; title: string; href: string; cta: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <p className="eyebrow text-lime">{eyebrow}</p>
        <h2 className="mt-0.5 text-3xl leading-none sm:text-4xl">{title}</h2>
      </div>
      <Link href={href} className="shrink-0 rounded-full border border-ink-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-fg hover:border-fg/60">
        {cta} →
      </Link>
    </div>
  );
}
