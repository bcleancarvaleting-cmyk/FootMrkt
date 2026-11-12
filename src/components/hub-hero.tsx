import { ClubCrest } from "@/components/club-crest";
import { HERO_PHOTOS, PhotoBackground } from "@/components/hero-background";
import { HeroCarousel } from "@/components/hero-carousel";
import { HeroSlide } from "@/components/hero-slide";
import { PlayerCard } from "@/components/player-card";
import { toCrest } from "@/lib/crest";
import type { CardView } from "@/lib/view";
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

  const labels = ["My Club", "Packs", "Transfer list", "Matches", "Challenges"];
  const pct = change !== null && change !== undefined ? `${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}%` : null;
  const fan = (list: CardView[]) => (
    <div className="relative flex h-[330px] items-center justify-center sm:h-[380px]">
      {list.map((c, i) => (
        <div key={c.id} className="absolute" style={{ transform: `translateX(${(i - 1) * 130}px) translateY(${i === 1 ? -10 : 18}px) rotate(${(i - 1) * 8}deg)`, zIndex: i === 1 ? 2 : 1 }}>
          <PlayerCard card={c} size={i === 1 ? "lg" : "md"} showcase />
        </div>
      ))}
    </div>
  );
  // Best player in the middle of the fan.
  const club3 = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3;
  const market3 = market?.rows.slice(0, 3).map((r) => r.card) ?? [];
  const marketFan = market3.length === 3 ? [market3[1], market3[0], market3[2]] : market3;
  const nextGame = games.find((g) => g.entries[0]) ?? games[0];
  const openGames = games.filter((g) => (g.status === "OPEN" || g.status === "UPCOMING") && g.locksAt > now);
  const liveGames = games.filter((g) => g.status === "PROVISIONAL" || g.status === "LOCKED");
  const toEnter = openGames.filter((g) => !g.entries[0]).length;
  const gameLine = (g: (typeof games)[number]) => {
    const ko = g.gameweek.simulated ? g.gameweek.startsAt : new Date(g.locksAt.getTime() + 10 * 60_000);
    const live = g.status === "PROVISIONAL" || g.status === "LOCKED";
    return `${g.gameweek.simulated ? "SIM · " : ""}${g.name.replace(/ · (SIM|GW) ?\d+$/, "")} — ${live ? "in play" : g.entries[0] ? `you're in · KO ${ukWhen(ko)}` : `KO ${ukWhen(ko)}`}`;
  };

  return (
    <div className="-mx-4 sm:-mx-6 lg:mx-0">
      <HeroCarousel labels={labels}>
        <HeroSlide
          background={<PhotoBackground src={HERO_PHOTOS.nightStadium} />}
          eyebrow="My Club"
          title={user.clubName ?? `${name}'s club`}
          accent={`£${pf.value.toFixed(2)}.`}
          body={
            <>
              {cards.length} players in your club{pct ? <> · value <b className={change! >= 0 ? "text-mint" : "text-danger"}>{pct}</b></> : null}. Welcome back, {name}.
            </>
          }
          points={top3.map((c) => `${c.name} · ${c.valueMp !== null && c.valueMp !== undefined ? `£${c.valueMp.toFixed(2)}` : "—"}`)}
          visual={
            <div className="relative">
              {crest && (
                <div className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
                  <ClubCrest crest={crest} id="hub-crest" size={64} />
                </div>
              )}
              {club3.length ? fan(club3) : null}
            </div>
          }
          ctas={[{ href: "/account/club", label: "My Club" }, crest ? { href: "/transfers/market", label: "Sign players", tone: "ghost" } : { href: "/account/club/crest", label: "Design your crest", tone: "ghost" }]}
        />

        <HeroSlide
          background={<PhotoBackground src={HERO_PHOTOS.ballBoots} position="60% 50%" />}
          eyebrow="Buy packs"
          title="Rip packs,"
          accent="pull Golds."
          body={unopened ? <>You&apos;ve got <b className="text-[#f0cb5a]">{unopened} pack{unopened === 1 ? "" : "s"}</b> waiting to open.</> : "Bronze, Silver and Gold England packs — every card a numbered copy of a real player."}
          points={["England Bronze, Silver and Gold packs", "Published odds on every pack", "A free booster every week"]}
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
          ctas={[{ href: "/packs", label: unopened ? `Open ${unopened} pack${unopened === 1 ? "" : "s"}` : "Pack shop", tone: "gold" }]}
        />

        <HeroSlide
          background={<PhotoBackground src={HERO_PHOTOS.bootBall} position="50% 40%" />}
          eyebrow="Transfer list"
          title="Buy, sell,"
          accent="make offers."
          body={marketOn ? <>{market?.total ?? 0} players on the MATCHX market · {buyNows} buy-nows · {auctions} auction{auctions === 1 ? "" : "s"} live.</> : "Trade players with other managers and see every player's value graph before you buy."}
          points={market?.rows.slice(0, 3).map((r) => `${r.card.name} · ${fmtMp(r.priceMinor)} · ${r.copies} left`) ?? ["Buy now, offers and auctions", "Every player's value graph", "Opening soon"]}
          visual={marketFan.length ? fan(marketFan) : undefined}
          ctas={[{ href: "/transfers/market", label: "MATCHX market" }, { href: "/transfers", label: "Transfer list", tone: "ghost" }]}
        />

        <HeroSlide
          background={<PhotoBackground src={HERO_PHOTOS.floodlight} position="50% 40%" />}
          eyebrow="Matches"
          title={liveGames.length ? "Matchday" : "Pick your"}
          accent={liveGames.length ? "is live." : "seven."}
          body={games.length ? (toEnter ? <>{toEnter} match{toEnter === 1 ? "" : "es"} still to enter — pick your seven before entries close.</> : liveGames.length ? "Your teams are playing — watch your points go up live." : "You're in every open match. Good luck.") : "No matches right now — the next ones are coming soon."}
          points={games.map(gameLine)}
          visual={
            nextGame?.entries[0] ? (
              <div className="w-full max-w-xs rounded-2xl border border-white/15 bg-black/55 p-4 backdrop-blur">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#adfc07]">Your team sheet</p>
                <p className="mt-0.5 truncate font-display text-xl font-black uppercase italic">{nextGame.name.replace(/ · (SIM|GW) ?\d+$/, "")}</p>
                <ol className="mt-2 space-y-1 text-sm">
                  {nextGame.entries[0].selections.map((s, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="w-4 text-right text-[11px] text-white/40">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{s.player.displayName}</span>
                      {s.isCaptain && <span className="rounded bg-[#adfc07] px-1 text-[10px] font-black text-[#0a0d02]">C</span>}
                    </li>
                  ))}
                </ol>
              </div>
            ) : undefined
          }
          ctas={[
            ...(watch.sim ? [{ href: "/watch", label: "● Watch live sim", tone: "sim" as const }] : []),
            ...(watch.real ? [{ href: "/watch?scope=real", label: "● Watch live table" }] : []),
            { href: "/matches", label: toEnter ? "Pick my squad" : "All matches", tone: watch.sim || watch.real ? ("ghost" as const) : ("primary" as const) },
          ]}
        />

        <HeroSlide
          background={<PhotoBackground src={HERO_PHOTOS.ballBoots} position="30% 60%" />}
          eyebrow="Challenges"
          title="Hand in,"
          accent="cash in."
          body="Trade in players you don't need for £ credit and packs."
          points={openChallenges.length ? openChallenges.slice(0, 3).map((c) => `${c.name} · ${c.eligible >= c.criteria.count ? "ready to hand in" : `${c.eligible}/${c.criteria.count} cards`}`) : ["New challenges every week"]}
          ctas={[{ href: "/account/challenges", label: "Challenges" }]}
        />
      </HeroCarousel>
    </div>
  );
}

