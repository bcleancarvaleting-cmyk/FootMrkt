import Link from "next/link";
import { CardRow } from "@/components/card-row";
import { Countdown } from "@/components/countdown";
import { PlayerCard } from "@/components/player-card";
import { StadiumScene } from "@/components/stadium";
import { getCurrentUser } from "@/server/auth/session";
import { binderTotals } from "@/server/binder";
import { db } from "@/server/db";
import { activeDrop } from "@/server/drops";
import { isEnabled } from "@/server/flags";
import { currentGameweek } from "@/server/gameweeks";
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
  const [players, clubs] = await Promise.all([db.player.count({ where: { active: true } }), db.club.count()]);

  return (
    <div className="-mt-6 space-y-20">
      {/* Hero */}
      <section className="relative -mx-4 overflow-hidden sm:-mx-6 lg:mx-0 lg:rounded-b-[28px]">
        <StadiumScene className="absolute inset-0 h-full w-full" />
        <div className="relative grid min-h-[620px] items-end gap-10 px-5 pb-10 pt-28 sm:px-10 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:pb-16">
          <div className="max-w-xl space-y-6 text-[#f4f5f2]">
            <span className="tag border-white/25 text-white/80">Premier League → National League</span>
            <h1 className="text-[64px] leading-[0.86] sm:text-8xl">
              Your club
              <br />
              <span className="text-[#adfc07]">starts here.</span>
            </h1>
            <p className="max-w-md text-lg text-white/75">
              Open packs of real English footballers, build a seven-a-side squad and score points from what they do on the pitch every weekend.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="btn-primary px-7 py-4 text-sm">
                Join free — get 11 players
              </Link>
              <Link href="/how-it-works" className="btn border border-white/30 px-7 py-4 text-sm text-white hover:border-white/70">
                How it works
              </Link>
            </div>
            <p className="text-xs text-white/60">Free welcome gifts: a Silver pack on day 3 and a lucky Gold player on day 7 · 18+</p>
          </div>
          <div className="relative hidden h-[400px] items-center justify-center lg:flex">
            {picks.map((c, i) => (
              <div
                key={c.id}
                className="absolute"
                style={{ transform: `translateX(${(i - 1) * 130}px) translateY(${i === 1 ? -10 : 18}px) rotate(${(i - 1) * 8}deg)`, zIndex: i === 1 ? 2 : 1 }}
              >
                <PlayerCard card={c} size={i === 1 ? "lg" : "md"} />
              </div>
            ))}
          </div>
        </div>
      </section>

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
            ["01", "Open packs", "Start with a free 11-player squad, then a Silver pack on day 3 and a lucky Gold on day 7. Every card is a numbered copy of a real player — Bronze, Silver or Gold by real market value."],
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
        <Feature eyebrow="Transfers" title="Buy, sell, make offers" body="Trade cards with other managers in MP. See the average selling price and the all-time value graph before you buy. Plus house auctions that release new cards into the game." href="/register" cta="Start trading" />
        <Feature eyebrow="Challenges" title="Keep your squad moving" body="Hand in cards you don't need for MP and packs. They go back into the packs for someone else to pull." href="/register" cta="See challenges" />
        <Feature eyebrow="Matches" title="Every gameweek, a new table" body="Open leagues, Bronze-only cups and more. Squads lock 10 minutes before the first kick-off." href="/register" cta="Enter a match" />
        <Feature eyebrow="Free packs" title="Drop days" body="We drop free packs on big matchdays. Claim within 24 hours — keep an eye on the Packs page." href="/register" cta="Join free" />
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden rounded-[28px] border border-ink-700 bg-ink-900 px-6 py-14 text-center">
        <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-[70%] rounded-full bg-accent/20 blur-3xl" aria-hidden="true" />
        <h2 className="relative text-5xl sm:text-6xl">Kick off for free</h2>
        <p className="relative mx-auto mt-3 max-w-md text-muted">Sign up in a minute and open your Starter Pack straight away.</p>
        <Link href="/register" className="btn-primary relative mt-6 px-8 py-4 text-sm">
          Create my club
        </Link>
        <p className="relative mt-4 text-xs text-faint">Player values go up and down. MP is an in-game balance, not an investment.</p>
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
  const [gw, totals, unopened, recent, bal, drop, auctions, auctionsOn] = await Promise.all([
    currentGameweek(),
    binderTotals(userId),
    db.packEntitlement.count({ where: { userId, status: "UNOPENED" } }),
    cardViews({ ownerId: userId, supplyState: "HELD" }, [{ updatedAt: "desc" }], 5),
    balancesFor(userId),
    activeDrop(),
    db.auction.count({ where: { status: "LIVE" } }),
    isEnabled("AUCTIONS"),
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

      {drop && (
        <Link href="/packs" className="drop-glow flex items-center gap-4 rounded-2xl border border-accent/70 bg-ink-900 px-4 py-3">
          <span className="live-dot" aria-hidden="true" />
          <span className="flex-1 font-semibold">Free pack drop: {drop.title}</span>
          <Countdown to={drop.endsAt.toISOString()} className="text-sm font-bold" />
          <span className="text-lime">→</span>
        </Link>
      )}

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-700 bg-ink-700 lg:grid-cols-4">
        {[
          ["Balance", fmtMp(bal.total), "Wallet", "/account/wallet"],
          ["My Club", `${totals.total} cards`, `${totals.byCategory.GOLD} Gold · ${totals.byCategory.SILVER} Silver`, "/account/club"],
          auctionsOn ? ["Auctions", `${auctions} live`, "Bid on new cards", "/transfers/auctions"] : ["Auctions", "Coming soon", "Opens after the beta", "/transfers/auctions"],
          ["Challenges", "Hand in", "Earn MP & packs", "/account/challenges"],
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
