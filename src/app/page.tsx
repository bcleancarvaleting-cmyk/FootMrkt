import Link from "next/link";
import { PredictionButtons } from "@/components/daily-panel";
import { LevelBadge } from "@/components/level-badge";
import { PREDICTION_XP, predictionPanel } from "@/server/predictions";
import { managerLevel } from "@/server/progression";
import { CardRow } from "@/components/card-row";
import { Countdown } from "@/components/countdown";
import { PlayerCard } from "@/components/player-card";
import { StadiumScene } from "@/components/stadium";
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
  const [players, clubs] = await Promise.all([db.player.count({ where: { active: true } }), db.club.count()]);

  return (
    <div className="-mt-6 space-y-20">
      {/* Hero: swipe between the three things you do on MATCHX */}
      <div className="-mx-4 sm:-mx-6 lg:mx-0">
        <HeroCarousel labels={["Manage your team", "Transfer market", "Buy packs"]}>
          <Slide
            background={<StadiumScene className="absolute inset-0 h-full w-full" />}
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
            body="Free packs for your first four weeks: 12 players when you join, then a Squad Boost, a Gold, a Mixed Pack and your choice of Gold. Invite friends for more."
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
            ["01", "Open packs", "Start with 12 free players, then free packs every few days for your first four weeks. Every card is a numbered copy of a real player — Bronze, Silver or Gold by real market value."],
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
              Play free — get 12 players
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
  const [gw, totals, unopened, recent, bal, drop, playerDrops, marketOn, top, level, streak, prediction] = await Promise.all([
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
  ]);
  const comps = gw
    ? await db.competition.findMany({ where: { gameweekId: gw.id }, include: { entries: { where: { userId } }, _count: { select: { entries: true } } }, orderBy: { name: "asc" } })
    : [];
  const lock = comps[0]?.locksAt;
  const open = gw && (gw.status === "OPEN" || gw.status === "UPCOMING");
  const entered = comps.filter((c) => c.entries.length).length;

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[28px] border border-ink-700">
        <StadiumScene className="absolute inset-0 h-full w-full" />
        <div className="relative flex min-h-[300px] flex-col justify-end gap-4 p-6 text-[#f4f5f2] sm:p-10">
          <span className="tag w-fit border-white/25 text-white/80">{gw ? `Gameweek ${gw.number} · ${gw.season}` : "Welcome"}</span>
          <h1 className="text-5xl leading-[0.9] sm:text-7xl">
            {open ? "Pick your squad" : gw?.status === "SETTLED" ? "Results are in" : "Matchday is live"}
          </h1>
          <p className="text-white/75">
            Welcome back, {name}.{" "}
            {open && lock && (
              <>
                Squads lock in <Countdown to={lock.toISOString()} className="font-bold text-[#adfc07]" /> ({fmtDate(lock)}).
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/matches" className="btn-primary px-6">
              {open ? (entered ? `Entered ${entered}/${comps.length} — edit` : "Pick squad") : "Live scores"}
            </Link>
            {unopened > 0 && (
              <Link href="/packs" className="btn-gold px-6">
                Open {unopened} pack{unopened > 1 ? "s" : ""}
              </Link>
            )}
          </div>
        </div>
      </section>

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
              <PredictionButtons questionId={prediction.question.id} initial={prediction.mine?.guess ?? null} locked={prediction.question.locksAt <= new Date()} />
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

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-700 bg-ink-700 lg:grid-cols-4">
        {[
          ["Balance", fmtMp(bal.total), "Wallet", "/account/wallet"],
          ["My Club", `${totals.total} cards`, `${totals.byCategory.GOLD} Gold · ${totals.byCategory.SILVER} Silver`, "/account/club"],
          marketOn ? ["Player drops", `${playerDrops} live`, "New players every day", "/transfers/drops"] : ["Player drops", "Coming soon", "Opens after the beta", "/transfers/drops"],
          ["Challenges", "Hand in", "Earn MX & packs", "/account/challenges"],
        ].map(([k, v, s, href]) => (
          <Link key={k} href={href} className="bg-ink-900 p-5 transition hover:bg-ink-850">
            <p className="eyebrow">{k}</p>
            <p className="mt-1 font-display text-3xl font-extrabold italic">{v}</p>
            <p className="truncate text-xs text-faint">{s}</p>
          </Link>
        ))}
      </section>

      {comps.length > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-3xl">This gameweek</h2>
            <Link href="/matches" className="text-xs font-bold uppercase tracking-[0.14em] text-lime">All matches →</Link>
          </div>
          <ul className="space-y-2">
            {comps.map((c) => {
              const e = c.entries[0];
              return (
                <li key={c.id}>
                  <Link href={`/competitions/${c.id}`} className="row-item">
                    <span className="flex-1 font-display text-xl font-bold uppercase italic">{c.name}</span>
                    <span className="text-xs text-muted">{c._count.entries} managers</span>
                    <span className="w-36 text-right text-sm font-semibold">
                      {e ? (e.finalPoints !== null ? <span className="text-lime">{e.finalPoints} pts · #{e.rank}</span> : e.provisionalPoints !== null ? <span className="text-mint">{e.provisionalPoints} pts live</span> : <span className="text-mint">Entered ✓</span>) : c.status === "OPEN" ? <span className="text-warn">Enter →</span> : <span className="text-faint">—</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {top.length > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-3xl">Top performers</h2>
            <Link href="/top-performers" className="text-xs font-bold uppercase tracking-[0.14em] text-lime">All rankings →</Link>
          </div>
          <ol className="divide-y divide-ink-700 overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
            {top.slice(0, 5).map((r, i) => (
              <li key={r.playerId}>
                <Link href={`/players/${r.playerId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ink-850">
                  <span className={`w-5 text-center font-display text-lg font-black ${i === 0 ? "text-lime" : "text-muted"}`}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {r.position} · {r.club} · {r.leagueName}
                    </span>
                  </span>
                  <span className="font-display text-2xl font-black tabular-nums">{r.points}</span>
                  <span className="text-xs text-muted">pts</span>
                </Link>
              </li>
            ))}
          </ol>
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
