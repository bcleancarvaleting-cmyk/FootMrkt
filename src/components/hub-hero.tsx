import Link from "next/link";
import { ClubCrest } from "@/components/club-crest";
import { HeroCarousel } from "@/components/hero-carousel";
import { PlayerCard } from "@/components/player-card";
import { SimBadge } from "@/components/sim-badge";
import { toCrest } from "@/lib/crest";
import { binder, portfolio } from "@/server/binder";
import { challengeBoard } from "@/server/challenges";
import { db } from "@/server/db";
import { marketBoard } from "@/server/market-board";
import { fmtMp } from "@/server/wallet";

/**
 * The signed-in home hero: swipe between the parts of your game — My Club, Packs, Transfers,
 * Matches (with your team sheets) and Challenges — each with what's happening now and one tap in.
 */
const ukWhen = (d: Date) => d.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export async function HubHero({ userId, name, unopened, marketOn, buyNows, auctions, watch }: { userId: string; name: string; unopened: number; marketOn: boolean; buyNows: number; auctions: number; watch: { sim: boolean; real: boolean } }) {
  const now = new Date();
  const [user, cards, pf, market, games, challenges] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { clubName: true, crest: true } }),
    binder(userId),
    portfolio(userId, now),
    marketOn ? marketBoard({ sort: "value", page: 1 }).catch(() => null) : Promise.resolve(null),
    db.competition.findMany({
      where: { status: { in: ["OPEN", "UPCOMING", "LOCKED", "PROVISIONAL"] } },
      orderBy: { locksAt: "asc" },
      take: 4,
      select: {
        id: true,
        name: true,
        status: true,
        locksAt: true,
        gameweek: { select: { id: true, simulated: true, startsAt: true } },
        _count: { select: { entries: true } },
        entries: { where: { userId, status: "ACTIVE" }, select: { provisionalPoints: true, selections: { where: { slot: "STARTER" }, orderBy: { order: "asc" }, select: { isCaptain: true, player: { select: { displayName: true } } } } } },
      },
    }),
    challengeBoard(userId, now).catch(() => []),
  ]);
  const crest = toCrest(user.crest);
  const top3 = [...cards].sort((a, b) => (b.valueMp ?? 0) - (a.valueMp ?? 0)).slice(0, 3);
  const openChallenges = challenges.filter((c) => !c.maxed);
  const change = pf.changePct;

  const labels = ["My Club", "Packs", "Transfers", "Matches", "Challenges"];
  return (
    <div className="-mx-4 sm:mx-0">
      <HeroCarousel labels={labels}>
        {/* My Club */}
        <Frame tone="lime" href="/account/club" cta="My Club">
          <div className="flex items-center gap-4">
            {crest ? <ClubCrest crest={crest} id="hub-crest" size={72} /> : <Link href="/account/club/crest" className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl border border-dashed border-white/30 text-center text-[10px] font-bold text-white/60">Design crest</Link>}
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">Welcome back, {name}</p>
              <h2 className="truncate font-display text-4xl font-black uppercase italic leading-none sm:text-5xl">{user.clubName ?? `${name}'s club`}</h2>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
            <span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Club value</span>
              <span className="font-display text-4xl font-black italic tabular-nums text-[#adfc07]">£{pf.value.toFixed(2)}</span>
              {change !== null && change !== undefined && <span className={`ml-2 text-sm font-bold ${change >= 0 ? "text-mint" : "text-danger"}`}>{change >= 0 ? "▲" : "▼"} {Math.abs(change)}%</span>}
            </span>
            <span className="text-sm text-white/70">{cards.length} players</span>
          </div>
          {top3.length > 0 && (
            <div className="mt-4 flex justify-center gap-2 sm:justify-start">
              {top3.map((c) => (
                <PlayerCard key={c.id} card={c} size="sm" showcase />
              ))}
            </div>
          )}
        </Frame>

        {/* Packs */}
        <Frame tone="gold" href="/packs" cta={unopened ? `Open ${unopened} pack${unopened === 1 ? "" : "s"}` : "Pack shop"}>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">Packs</p>
          <h2 className="font-display text-5xl font-black uppercase italic leading-none">{unopened ? <>{unopened} to <span className="text-[#f0cb5a]">open</span></> : <>Rip a <span className="text-[#f0cb5a]">pack</span></>}</h2>
          <p className="mt-2 max-w-sm text-sm text-white/70">Starters, weekly boosters, gifts and the shop — Bronze, Silver and Gold, with published odds.</p>
          <div className="mt-5 flex items-end justify-center gap-3">
            {(["bronze", "silver", "gold"] as const).map((t, i) => (
              <div key={t} className={`card-premium ${t === "gold" ? "is-gold" : ""} foil-${t} relative flex h-36 w-24 items-end overflow-hidden rounded-2xl p-2.5 shadow-2xl sm:h-44 sm:w-28`} style={{ transform: `translateY(${i === 2 ? -12 : 0}px) rotate(${(i - 1) * 4}deg)` }}>
                <span className="sheen" aria-hidden="true" />
                {t === "gold" && <span className="holo" aria-hidden="true" />}
                <span className="relative font-display text-2xl font-extrabold uppercase italic leading-none text-black/75">{t}</span>
              </div>
            ))}
          </div>
        </Frame>

        {/* Transfers */}
        <Frame tone="gold" href="/transfers/market" cta="Transfers">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">Transfers</p>
          <h2 className="font-display text-5xl font-black uppercase italic leading-none">Buy · sell · <span className="text-[#adfc07]">bid</span></h2>
          <p className="mt-2 text-sm text-white/70">{marketOn ? `${market?.total ?? 0} players on the MATCHX market · ${buyNows} buy-nows · ${auctions} auction${auctions === 1 ? "" : "s"} live` : "Opening soon"}</p>
          {market && market.rows.length > 0 && (
            <ul className="mt-4 space-y-2">
              {market.rows.slice(0, 3).map((r) => (
                <li key={r.listingId} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/35 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <b className="block truncate">{r.card.name}</b>
                    <span className="text-[11px] text-white/55">{r.card.clubName} · {r.card.category.toLowerCase()} · {r.copies} left</span>
                  </span>
                  <span className="font-display text-xl font-black italic tabular-nums text-[#adfc07]">{fmtMp(r.priceMinor)}</span>
                </li>
              ))}
            </ul>
          )}
        </Frame>

        {/* Matches */}
        <Frame tone="lime" href="/matches" cta="All matches">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">Upcoming matches</p>
            <span className="flex gap-2">
              {watch.real && <Link href="/watch?scope=real" className="watch-btn rounded-full bg-[#adfc07] px-3 py-1 text-[10px] font-black uppercase text-[#0a0d02]">● Live table</Link>}
              {watch.sim && <Link href="/watch" className="watch-btn rounded-full bg-[#8fe3ff] px-3 py-1 text-[10px] font-black uppercase text-[#04121a]">● Live sim</Link>}
            </span>
          </div>
          {games.length === 0 ? (
            <p className="mt-6 font-display text-3xl font-black uppercase italic">No matches yet — next ones coming soon</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {games.map((g) => {
                const mine = g.entries[0];
                const ko = g.gameweek.simulated ? g.gameweek.startsAt : new Date(g.locksAt.getTime() + 10 * 60_000);
                const open = (g.status === "OPEN" || g.status === "UPCOMING") && g.locksAt > now;
                const playing = g.status === "PROVISIONAL" || g.status === "LOCKED";
                return (
                  <li key={g.id} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {g.gameweek.simulated && <SimBadge />}
                      <b className="min-w-0 flex-1 truncate">{g.name.replace(/ · (SIM|GW) ?\d+$/, "")}</b>
                      {playing ? (
                        <Link href={g.gameweek.simulated ? `/watch?gw=${g.gameweek.id}` : "/watch?scope=real"} className="rounded-full bg-danger px-2.5 py-1 text-[10px] font-black uppercase text-white">● In play</Link>
                      ) : open ? (
                        <Link href={`/competitions/${g.id}`} className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${mine ? "border border-white/30 text-white" : "bg-[#adfc07] text-[#0a0d02]"}`}>{mine ? "Edit" : "Pick team"}</Link>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[11px] text-white/55">
                      KO {ukWhen(ko)} · {g._count.entries} manager{g._count.entries === 1 ? "" : "s"}
                      {mine && playing && mine.provisionalPoints != null && <b className="ml-2 text-[#adfc07]">{Math.round(mine.provisionalPoints * 10) / 10} pts</b>}
                    </p>
                    {mine && (
                      <p className="mt-1 truncate text-[11px] text-white/80">
                        {mine.selections.map((s) => `${s.player.displayName.split(" ").slice(-1)[0]}${s.isCaptain ? " (C)" : ""}`).join(" · ")}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Frame>

        {/* Challenges */}
        <Frame tone="lime" href="/account/challenges" cta="Challenges">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">Challenges</p>
          <h2 className="font-display text-5xl font-black uppercase italic leading-none">Hand <span className="text-[#adfc07]">in</span></h2>
          <p className="mt-2 text-sm text-white/70">Trade in players you don&apos;t need for £ credit and packs.</p>
          {openChallenges.length ? (
            <ul className="mt-4 space-y-2">
              {openChallenges.slice(0, 3).map((c) => (
                <li key={c.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/35 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <b className="block truncate">{c.name}</b>
                    <span className="block truncate text-[11px] text-white/55">{c.summary}</span>
                  </span>
                  <span className={`shrink-0 text-xs font-bold ${c.eligible >= c.criteria.count ? "text-[#adfc07]" : "text-white/50"}`}>{c.eligible >= c.criteria.count ? "Ready ✓" : `${c.eligible}/${c.criteria.count}`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-sm text-white/60">No challenges running right now.</p>
          )}
        </Frame>
      </HeroCarousel>
    </div>
  );
}

function Frame({ tone, href, cta, children }: { tone: "lime" | "gold"; href: string; cta: string; children: React.ReactNode }) {
  return (
    <div className={`relative flex h-full min-h-[520px] flex-col overflow-hidden border-y border-ink-700 bg-[#0b0e0c] p-5 text-[#f4f5f2] sm:rounded-[28px] sm:border sm:p-8`}>
      <div className={`pointer-events-none absolute inset-0 ${tone === "gold" ? "bg-[radial-gradient(120%_80%_at_85%_10%,rgb(240_203_90/0.18),transparent_60%)]" : "bg-[radial-gradient(120%_80%_at_85%_10%,rgb(173_252_7/0.16),transparent_60%)]"}`} aria-hidden="true" />
      <div className="relative flex-1">{children}</div>
      <Link href={href} className={`relative mt-5 self-start px-6 py-3 text-sm ${tone === "gold" ? "btn-gold" : "btn-primary"}`}>
        {cta} →
      </Link>
    </div>
  );
}
