import Link from "next/link";
import { PredictionButtons } from "@/components/daily-panel";
import { LevelBadge } from "@/components/level-badge";
import { PREDICTION_XP, predictionPanel } from "@/server/predictions";
import { managerLevel } from "@/server/progression";
import { CardRow } from "@/components/card-row";
import { Countdown, CountdownBlocks } from "@/components/countdown";
import { PlayerCard } from "@/components/player-card";
import { ClubBadge } from "@/components/club-badge";
import { KitShirt } from "@/components/kit-shirt";
import { MatchCard } from "@/components/match-card";
import { Sparkline } from "@/components/card-row";
import { getText } from "@/server/settings";
import { HeroCarousel } from "@/components/hero-carousel";
import { TakeItOnTheGo } from "@/components/app-install";
import { CommunityLinks } from "@/components/community-links";
import { EndedLoansBanner } from "@/components/loan-banner";
import { RowStat } from "@/components/card-row";
import { getCurrentUser } from "@/server/auth/session";
import { binderTotals } from "@/server/binder";
import { db } from "@/server/db";
import { activeDrop, giftLabel } from "@/server/drops";
import { isEnabled } from "@/server/flags";
import { currentGameweek } from "@/server/gameweeks";
import { performanceTable } from "@/server/top-performers";
import { cardViews } from "@/server/views";
import { balancesFor, fmtMp } from "@/server/wallet";
import { fmtDate } from "@/lib/view";

export default async function Home() {
  const user = await getCurrentUser();
  return user ? <Hub userId={user.id} name={user.displayName} /> : <Landing />;
}

async function Landing() {
  const showcase = await cardViews(
    { template: { category: "GOLD", edition: "STANDARD", player: { club: { league: { isTopFlight: true } } } }, supplyState: { in: ["AVAILABLE", "RECIRCULATING"] }, serial: 1 },
    [{ template: { player: { squadNumber: "asc" } } }],
    40,
  );
  const picks = [showcase[3], showcase[0], showcase[11]].filter(Boolean);
  const market = [showcase[5], showcase[8], showcase[14], showcase[20]].filter(Boolean);
  const [players, clubs, heroImage] = await Promise.all([db.player.count({ where: { active: true } }), db.club.count(), getText("homeHeroImage")]);

  return (
    <div className="-mt-6 space-y-20">
      {/* Hero: swipe between the three things you do on MATCHX */}
      <div className="-mx-4 sm:-mx-6 lg:mx-0">
        <HeroCarousel labels={["Manage your team", "Transfer market", "Buy packs"]}>
          <Slide
            background={<HeroBackground image={heroImage} />}
            eyebrow="Manage your team"
            title={
              <>
                Your club
                <br />
                <span className="text-[#adfc07]">starts here.</span>
              </>
            }
            body="Pick seven real English footballers from your club, choose a formation and score points from what they do on the pitch every weekend."
            points={["2-2-2, 2-3-1, 3-2-1 or 3-1-2", "Four subs come on if a starter doesn't play", "Free matches every gameweek, with prizes"]}
            visual={
              <div className="relative flex h-[380px] items-center justify-center">
                {picks.map((c, i) => (
                  <div key={c.id} className="absolute" style={{ transform: `translateX(${(i - 1) * 130}px) translateY(${i === 1 ? -10 : 18}px) rotate(${(i - 1) * 8}deg)`, zIndex: i === 1 ? 2 : 1 }}>
                    <PlayerCard card={c} size={i === 1 ? "lg" : "md"} />
                  </div>
                ))}
              </div>
            }
          />
          <Slide
            eyebrow="Transfer market"
            title={
              <>
                Buy, sell,
                <br />
                <span className="text-[#adfc07]">make offers.</span>
              </>
            }
            body="Trade players with other managers using MX you've earned from XP, challenges and sales. See every player's value graph before you buy."
            points={["Earn XP from every point your players score", "Swap 100 XP for 1 MX", "Opening soon"]}
            visual={
              <ul className="w-full max-w-lg space-y-2 text-left">
                {market.map((c) => (
                  <CardRow key={c.id} card={c}>
                    <RowStat label="Buy now" className="w-20">
                      <span className="text-lime">{c.valueMp ?? 1} MX</span>
                    </RowStat>
                  </CardRow>
                ))}
              </ul>
            }
          />
          <Slide
            eyebrow="Buy packs"
            title={
              <>
                Rip packs,
                <br />
                <span className="text-[#adfc07]">pull Golds.</span>
              </>
            }
            body="49 free players to start your MatchX journey: a full squad for the Premier League, Championship, League One and League Two, three league picks and two Premier League Gold loans. Plus a free booster every week."
            points={["England Bronze, Silver and Gold packs", "Published odds on every pack", "Pack shop coming soon"]}
            visual={
              <div className="flex items-end justify-center gap-4">
                {(["bronze", "silver", "gold"] as const).map((t, i) => (
                  <div key={t} className={`card-premium ${t === "gold" ? "is-gold" : ""} foil-${t} relative flex h-48 w-32 items-end overflow-hidden rounded-2xl p-3 shadow-2xl sm:h-60 sm:w-40`} style={{ transform: `translateY(${i === 2 ? -16 : 0}px)` }}>
                    <span className="sheen" aria-hidden="true" />
                    {t === "gold" && <span className="holo" aria-hidden="true" />}
                    <span className="absolute left-3 top-3 text-[10px] font-extrabold uppercase italic tracking-[0.2em] text-black/60">England</span>
                    <span className="relative font-display text-3xl font-extrabold uppercase italic leading-none text-black/75 sm:text-4xl">{t}</span>
                  </div>
                ))}
              </div>
            }
          />
        </HeroCarousel>
      </div>

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
            ["01", "Open packs", "Start with 49 free players across all four leagues, then a free booster every week. Every card is a numbered copy of a real player — Bronze, Silver or Gold by real market value."],
            ["02", "Pick your seven", "Choose a formation, a keeper, defenders, midfielders and attackers, plus four subs who come on if a starter doesn't play."],
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
        <Feature eyebrow="Challenges" title="Keep your squad moving" body="Hand in cards you don't need for MX and packs. They go back into the packs for someone else to pull." href="/register" cta="See challenges" />
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
        <p className="relative mt-4 text-xs text-faint">Player values go up and down. MX is an in-game balance, not an investment.</p>
      </section>
    </div>
  );
}

function Slide({ background, eyebrow, title, body, points, visual }: { background?: React.ReactNode; eyebrow: string; title: React.ReactNode; body: string; points: string[]; visual: React.ReactNode }) {
  return (
    <div className="relative h-full overflow-hidden bg-[#0b0e0c] lg:rounded-[28px]">
      {background ?? <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_80%_20%,rgb(173_252_7/0.14),transparent_60%)]" aria-hidden="true" />}
      <div className="relative grid min-h-[600px] items-center gap-10 px-5 pb-10 pt-20 sm:px-10 lg:grid-cols-[1.05fr_1fr] lg:pt-14">
        <div className="max-w-xl space-y-5 text-[#f4f5f2]">
          <span className="tag border-white/25 text-white/80">{eyebrow}</span>
          <h1 className="text-[56px] leading-[0.86] sm:text-7xl">{title}</h1>
          <p className="max-w-md text-lg text-white/75">{body}</p>
          <ul className="space-y-1.5 text-sm text-white/80">
            {points.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <span className="text-[#adfc07]">✓</span> {p}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-3 pt-1 sm:flex-row">
            <Link href="/register" className="btn-primary px-7 py-4 text-sm">
              Play free — get 49 players
            </Link>
            <Link href="/how-it-works" className="btn border border-white/30 px-7 py-4 text-sm text-white hover:border-white/70">
              How it works
            </Link>
          </div>
        </div>
        <div className="flex justify-center">{visual}</div>
      </div>
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
  const [gw, totals, unopened, recent, bal, drop, playerDrops, marketOn, top, level, streak, prediction, auctions, leagues] = await Promise.all([
    currentGameweek(),
    binderTotals(userId),
    db.packEntitlement.count({ where: { userId, status: "UNOPENED" } }),
    cardViews({ ownerId: userId, supplyState: "HELD" }, [{ updatedAt: "desc" }], 5),
    balancesFor(userId),
    activeDrop(),
    db.marketListing.count({ where: { house: true, status: "ACTIVE", liveAt: { lte: new Date() }, card: { packable: false } } }),
    isEnabled("MARKET"),
    performanceTable({ window: "last" }),
    managerLevel(userId),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { loginStreak: true, bestStreak: true } }),
    predictionPanel(userId),
    db.auction.count({ where: { status: "LIVE" } }),
    db.miniLeagueMember.count({ where: { userId } }),
  ]);
  const [comps, heroImage, paidEntry] = await Promise.all([
    gw
      ? db.competition.findMany({ where: { gameweekId: gw.id }, include: { entries: { where: { userId } }, _count: { select: { entries: true } } }, orderBy: [{ entryFeeMinor: "asc" }, { name: "asc" }] })
      : [],
    getText("homeHeroImage"),
    isEnabled("PAID_ENTRY"),
  ]);
  const potTotalGbp =
    comps.reduce((s, c) => s + ((c.rewards as Array<{ rankFrom: number; rankTo: number; cashMinor?: number }>) ?? []).filter((r) => r.cashMinor).reduce((k, r) => k + r.cashMinor! * (r.rankTo - r.rankFrom + 1), 0), 0) / 100;
  const lock = comps[0]?.locksAt;
  const open = gw && (gw.status === "OPEN" || gw.status === "UPCOMING");
  const entered = comps.filter((c) => c.entries.length).length;

  return (
    <div className="space-y-8">
      <section className="relative -mx-4 overflow-hidden border-y border-ink-700 sm:mx-0 sm:rounded-[28px] sm:border">
        <HeroBackground image={heroImage} />
        <div className="relative flex min-h-[560px] flex-col justify-end gap-5 p-5 pt-44 text-[#f4f5f2] sm:min-h-[540px] sm:p-10">
          <span className="flex flex-wrap items-center gap-2">
            {gw && gw.status === "PROVISIONAL" ? (
              <span className="flex items-center gap-1.5 rounded-full bg-danger px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-white">
                <span className="live-dot" aria-hidden="true" /> Live
              </span>
            ) : null}
            <span className="rounded-full border border-white/25 bg-black/30 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/85 backdrop-blur">
              {gw ? `Gameweek ${gw.number} · ${gw.season}` : "Welcome"}
            </span>
          </span>
          <div>
            <p className="text-sm font-semibold text-white/70">Welcome back, {name}</p>
            <h1 className="mt-1 text-[52px] leading-[0.86] drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] sm:text-8xl">
              {open ? (
                <>
                  Pick your <span className="text-[#adfc07]">squad</span>
                </>
              ) : gw?.status === "SETTLED" ? (
                <>
                  Results are <span className="text-[#adfc07]">in</span>
                </>
              ) : (
                <>
                  Matchday is <span className="text-[#adfc07]">live</span>
                </>
              )}
            </h1>
          </div>
          {open && lock && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Squads lock in</p>
              <CountdownBlocks to={lock.toISOString()} />
            </div>
          )}
          {comps.length > 0 && (
            <div className="grid max-w-xl grid-cols-3 overflow-hidden rounded-2xl border border-white/15 bg-black/35 backdrop-blur-md">
              {(
                [
                  ["Matches", String(comps.length)],
                  ["You're in", `${entered}/${comps.length}`],
                  ["Prize pots", potTotalGbp > 0 ? `£${potTotalGbp % 1 ? potTotalGbp.toFixed(2) : potTotalGbp}` : "Packs & XP"],
                ] as const
              ).map(([l, v], i) => (
                <span key={l} className={`px-3 py-2.5 ${i ? "border-l border-white/10" : ""}`}>
                  <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-white/55">{l}</span>
                  <span className={`block font-display text-xl font-black tabular-nums sm:text-2xl ${l === "Prize pots" ? "text-[#f0cb5a]" : ""}`}>{v}</span>
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Link href="/matches" className="btn-primary px-7 py-4 text-sm shadow-[0_8px_30px_-6px_rgba(173,252,7,0.55)]">
              {open ? (entered ? `Entered ${entered}/${comps.length} — edit` : "Pick my squad") : "Live scores"}
            </Link>
            {unopened > 0 && (
              <Link href="/packs" className="btn-gold px-7 py-4 text-sm">
                Open {unopened} pack{unopened > 1 ? "s" : ""}
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* The hub: every part of the game one tap away. */}
      <nav aria-label="Your game" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(
          [
            ["My Club", `${totals.total} players`, `${totals.byCategory.GOLD} Gold · ${totals.byCategory.SILVER} Silver · ${totals.byCategory.BRONZE} Bronze`, "/account/club", "text-lime"],
            ["Transfers", marketOn ? "Buy · sell · bid" : "Opens soon", marketOn ? `${playerDrops} MATCHX buy-nows · ${auctions} auction${auctions === 1 ? "" : "s"} live` : "MATCHX buy-nows and auctions", "/transfers", "text-gold"],
            ["Packs", unopened ? `${unopened} to open` : "Pack shop", "Starters, boosters, gifts and the shop", "/packs", ""],
            ["Matches", comps.length ? `${entered}/${comps.length} entered` : "No matches yet", comps.length ? (entered === comps.length ? "All entered ✓" : `${comps.length - entered} still to enter`) : "Next gameweek coming", "/matches", comps.length && entered === comps.length ? "text-mint" : "text-danger"],
            ["Wallet", fmtMp(bal.total), "MX and £ winnings", "/account/wallet", ""],
            ["Leagues", leagues ? `${leagues} league${leagues === 1 ? "" : "s"}` : "Start one", "Private leagues with friends", "/leagues", ""],
            ["Challenges", "Hand in", "Earn MX and packs", "/account/challenges", ""],
            ["Chat", "Managers", "Talk tactics and pack pulls", "/chat", ""],
          ] as const
        ).map(([k, v, s, href, tone]) => (
          <Link key={k} href={href} className={`rounded-2xl border bg-ink-900 p-4 transition hover:bg-ink-850 ${k === "Matches" && comps.length ? (entered === comps.length ? "border-mint/70" : "border-danger/60") : "border-ink-700"}`}>
            <p className={`eyebrow ${tone}`}>{k}</p>
            <p className="mt-1 font-display text-2xl font-extrabold uppercase italic leading-none">{v}</p>
            <p className="mt-1 text-xs text-faint">{s}</p>
          </Link>
        ))}
      </nav>

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
                    <KitShirt kit={r.kit} number={r.squadNumber} id={`top-${r.playerId}`} label={`${r.club ?? "Club"} shirt`} className={`relative mt-1 w-auto ${i === 1 ? "h-16 sm:h-20" : "h-12 sm:h-16"}`} />
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
                    <KitShirt kit={r.kit} number={r.squadNumber} id={`top-row-${r.playerId}`} label={`${r.club ?? "Club"} shirt`} className="h-8 w-auto shrink-0" />
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
const WEMBLEY = { src: "/hero/wembley-night.webp", fallback: "/hero/wembley-night.jpg", credit: "Photo: Martin Pettitt, CC BY 2.0", href: "https://commons.wikimedia.org/wiki/File:WembleyStadiumNight.jpg" };

function HeroBackground({ image }: { image: string }) {
  return (
    <>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <picture>
          <source srcSet={WEMBLEY.src} type="image/webp" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={WEMBLEY.fallback} alt="Wembley Stadium's arch lit up at night" className="absolute inset-0 h-full w-full object-cover object-[50%_30%]" fetchPriority="high" />
        </picture>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#060708] via-[#060708]/35 to-transparent" aria-hidden="true" />
      <div className="absolute inset-0 hidden bg-gradient-to-r from-[#060708]/75 via-[#060708]/10 to-transparent sm:block" aria-hidden="true" />
      {!image && (
        <a href={WEMBLEY.href} target="_blank" rel="noreferrer" className="absolute right-3 top-3 z-10 rounded bg-black/40 px-1.5 py-0.5 text-[9px] text-white/55 hover:text-white">
          {WEMBLEY.credit}
        </a>
      )}
    </>
  );
}

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
