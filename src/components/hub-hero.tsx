import Link from "next/link";
import { ClubCrest } from "@/components/club-crest";
import { PhotoBackground } from "@/components/hero-background";
import { heroPhotos } from "@/server/site-images";
import { HeroCarousel } from "@/components/hero-carousel";
import { HeroSlide } from "@/components/hero-slide";
import { PlayerCard } from "@/components/player-card";
import { FINISHES } from "@/config/tiers";
import { toCrest } from "@/lib/crest";
import type { CardView } from "@/lib/view";
import { binder, portfolio } from "@/server/binder";
import { challengeBoard } from "@/server/challenges";
import { db } from "@/server/db";
import { marketBoard } from "@/server/market-board";
import { cardViews } from "@/server/views";
import { fmtMp } from "@/server/wallet";

/**
 * The signed-in home hero: swipe between the parts of your game — My Club, Packs, Transfers,
 * Matches (with your team sheets) and Challenges — each with what's happening now and one tap in.
 */
const ukWhen = (d: Date) => d.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export async function HubHero({ userId, name, unopened, marketOn, buyNows, auctions, watch }: { userId: string; name: string; unopened: number; marketOn: boolean; buyNows: number; auctions: number; watch: { sim: boolean; real: boolean } }) {
  const now = new Date();
  const photos = await heroPhotos();
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
        entries: { where: { userId, status: "ACTIVE" }, select: { provisionalPoints: true, selections: { where: { slot: "STARTER" }, orderBy: { order: "asc" }, select: { isCaptain: true, player: { select: { displayName: true, lastName: true, position: true } } } } } },
      },
    }),
    challengeBoard(userId, now).catch(() => []),
  ]);
  const [packCards, recent] = await Promise.all([
    packShowcase(),
    // Newest players in, however they came (accepted offers, buys, packs) — loans and starters left out.
    db.cardOwnership.findMany({ where: { userId, releasedAt: null, acquiredVia: { notIn: ["STARTER_PACK"] } }, orderBy: { acquiredAt: "desc" }, take: 3, select: { cardId: true, acquiredAt: true } }),
  ]);
  const crest = toCrest(user.crest);
  const signings = recent.flatMap((o) => {
    const c = cards.find((x) => x.id === o.cardId);
    return c ? [{ ...c, at: o.acquiredAt }] : [];
  });
  const top3 = [...cards].sort((a, b) => (b.valueMp ?? 0) - (a.valueMp ?? 0)).slice(0, 3);
  const openChallenges = challenges.filter((c) => !c.maxed);
  const change = pf.changePct;

  const labels = ["My Club", "Packs", "Transfer list", "Matches", "Challenges"];
  const fan = (list: CardView[]) => (
    <div className="relative flex h-[330px] items-center justify-center sm:h-[380px]">
      {list.map((c, i) => (
        <div key={c.id} className="absolute" style={{ transform: `translateX(${(i - 1) * 130}px) translateY(${i === 1 ? -10 : 18}px) rotate(${(i - 1) * 8}deg)`, zIndex: i === 1 ? 2 : 1 }}>
          <PlayerCard card={c} size={i === 1 ? "lg" : "md"} showcase />
        </div>
      ))}
    </div>
  );
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
        {/* My Club — kept as managers know it */}
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
          {cards.length === 0 && (
            <Link href="/packs" className="mt-5 flex items-center gap-4 rounded-2xl border border-[#f0cb5a]/60 bg-gradient-to-r from-[#1d1606] to-black/40 p-4">
              <span className="text-4xl" aria-hidden="true">🎁</span>
              <span className="min-w-0 flex-1">
                <b className="block font-display text-2xl font-black uppercase italic leading-none">{unopened ? `${unopened} pack${unopened === 1 ? "" : "s"} to open` : "Build your squad"}</b>
                <span className="mt-1 block text-sm text-white/70">{unopened ? "Your starter players are waiting — open them to fill your club." : "Get players from packs, player drops and the market."}</span>
              </span>
              <span className="btn-gold shrink-0 px-4 py-2 text-xs">{unopened ? "Open" : "Packs"}</span>
            </Link>
          )}
          <div className={`mt-5 grid gap-3 lg:grid-cols-2 ${cards.length === 0 ? "hidden" : ""}`}>
            <ValueGraph series={pf.series} />
            <div className="rounded-2xl border border-white/10 bg-black/35 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">New signings</p>
              {signings.length ? (
                <ul className="mt-1.5 divide-y divide-white/10">
                  {signings.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 py-1.5 text-sm">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.finish ? "bg-[#ff8fa6]" : c.category === "GOLD" ? "bg-[#f0cb5a]" : c.category === "SILVER" ? "bg-[#c9cfd6]" : "bg-[#c98a55]"}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">
                        <b>{c.name}</b> <span className="text-white/50">· {c.clubShort ?? c.clubName ?? ""}</span>
                      </span>
                      <span className="shrink-0 text-[11px] text-white/45">{daysAgo(c.at)} · {c.acquired ?? ""}</span>
                      <span className="w-14 shrink-0 text-right font-bold tabular-nums text-[#adfc07]">{c.valueMp != null ? `£${c.valueMp.toFixed(2)}` : "—"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-white/60">No signings yet — make an offer on the Transfer list.</p>
              )}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              ["Playing this week", pf.playingSoon],
              ["Points won for you", Math.round(pf.points)],
              ["In your teams", pf.inSquads],
            ].map(([label, v]) => (
              <div key={label as string} className="rounded-xl border border-white/10 bg-black/35 px-2 py-2.5">
                <p className="font-display text-2xl font-black italic leading-none tabular-nums">{v as number}</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white/55">{label as string}</p>
              </div>
            ))}
          </div>
        </Frame>

        <HeroSlide
          background={<PhotoBackground src={photos.ballBoots} position="60% 50%" />}
          eyebrow="Buy packs"
          title="Pack"
          accent="Luck."
          body={unopened ? <>You&apos;ve got <b className="text-[#f0cb5a]">{unopened} pack{unopened === 1 ? "" : "s"}</b> waiting to open.</> : "Bronze, Silver and Gold England packs — every card a numbered copy of a real player."}
          points={["England Bronze, Silver and Gold packs", "Published odds on every pack", "A free booster every week"]}
          visual={packCards.length ? <CardStack cards={packCards} /> : undefined}
          ctas={[{ href: "/packs", label: unopened ? `Open ${unopened} pack${unopened === 1 ? "" : "s"}` : "Pack shop", tone: "gold" }]}
        />

        <HeroSlide
          background={<PhotoBackground src={photos.bootBall} position="50% 45%" />}
          eyebrow="Transfer list"
          title="Buy, Sell &"
          accent="Make Offers."
          body={marketOn ? <>{market?.total ?? 0} players on the MATCHX market · {buyNows} buy-nows · {auctions} auction{auctions === 1 ? "" : "s"} live.</> : "Trade players with other managers and see every player's value graph before you buy."}
          points={market?.rows.slice(0, 3).map((r) => `${r.card.name} · ${fmtMp(r.priceMinor)} · ${r.copies} left`) ?? ["Buy now, offers and auctions", "Every player's value graph", "Opening soon"]}
          visual={marketFan.length ? fan(marketFan) : undefined}
          ctas={[{ href: "/transfers/market", label: "MATCHX market" }, { href: "/transfers", label: "Transfer list", tone: "ghost" }]}
        />

        <HeroSlide
          background={<PhotoBackground src={photos.nightStadium} />}
          eyebrow="Matches"
          title="Pick your"
          accent="teams."
          body={games.length ? (toEnter ? <>{toEnter} match{toEnter === 1 ? "" : "es"} still to enter — pick your teams before entries close.</> : liveGames.length ? "Your teams are playing — watch your points go up live." : "You're in every open match. Good luck.") : "No matches right now — the next ones are coming soon."}
          points={games.map(gameLine)}
          visual={<TeamPitch name={nextGame?.entries[0] ? nextGame.name.replace(/ · (SIM|GW) ?\d+$/, "") : null} picks={nextGame?.entries[0]?.selections ?? []} />}
          ctas={[
            ...(watch.sim ? [{ href: "/watch", label: "● Watch live sim", tone: "sim" as const }] : []),
            ...(watch.real ? [{ href: "/watch?scope=real", label: "● Watch live table" }] : []),
            { href: "/matches", label: toEnter ? "Pick my squad" : "All matches", tone: watch.sim || watch.real ? ("ghost" as const) : ("primary" as const) },
          ]}
        />

        <HeroSlide
          background={<PhotoBackground src={photos.floodlight} position="50% 40%" />}
          eyebrow="Challenges"
          title="Challenge"
          accent="Yourself."
          body="Trade in players you don't need for £ credit and packs."
          points={openChallenges.length ? openChallenges.slice(0, 3).map((c) => `${c.name} · ${c.eligible >= c.criteria.count ? "ready to hand in" : `${c.eligible}/${c.criteria.count} cards`}`) : ["New challenges every week"]}
          ctas={[{ href: "/account/challenges", label: "Challenges" }]}
        />
      </HeroCarousel>
    </div>
  );
}

function Frame({ tone, href, cta, children }: { tone: "lime" | "gold"; href: string; cta: string; children: React.ReactNode }) {
  return (
    <div className="relative flex h-full min-h-[520px] flex-col overflow-hidden border-y border-ink-700 bg-[#0b0e0c] p-5 text-[#f4f5f2] sm:rounded-[28px] sm:border sm:p-8">
      <div className={`pointer-events-none absolute inset-0 ${tone === "gold" ? "bg-[radial-gradient(120%_80%_at_85%_10%,rgb(240_203_90/0.18),transparent_60%)]" : "bg-[radial-gradient(120%_80%_at_85%_10%,rgb(173_252_7/0.16),transparent_60%)]"}`} aria-hidden="true" />
      <div className="relative flex-1">{children}</div>
      <Link href={href} className={`relative mt-5 self-start px-6 py-3 text-sm ${tone === "gold" ? "btn-gold" : "btn-primary"}`}>
        {cta} →
      </Link>
    </div>
  );
}

const daysAgo = (at: Date) => {
  const d = Math.floor((Date.now() - at.getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`;
};

/** Club value over the recent valuations: an area line, green going up, red going down. */
function ValueGraph({ series }: { series: number[] }) {
  const W = 320;
  const H = 96;
  if (series.length < 2) {
    return (
      <div className="flex min-h-[132px] flex-col justify-between rounded-2xl border border-white/10 bg-black/35 p-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Club value</p>
        <p className="text-sm text-white/60">Your graph fills in as the market revalues your players.</p>
      </div>
    );
  }
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (v: number) => H - 6 - ((v - min) / span) * (H - 16);
  const line = series.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = series[series.length - 1] >= series[0];
  const colour = up ? "#adfc07" : "#ff5c5c";
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-3">
      <div className="flex items-baseline justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">
        <span>Club value</span>
        <span className="tabular-nums">
          low £{min.toFixed(2)} · high £{max.toFixed(2)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-2 h-24 w-full" role="img" aria-label={`Club value ${up ? "up" : "down"} from £${series[0].toFixed(2)} to £${series[series.length - 1].toFixed(2)}`}>
        <defs>
          <linearGradient id="hub-value-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={colour} stopOpacity="0.35" />
            <stop offset="100%" stopColor={colour} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#hub-value-fill)" />
        <path d={line} fill="none" stroke={colour} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/** The Packs slide's cards: Bronze, Silver, Gold, then Ruby, Diamond and Rainbow — fanned behind one another. */
function CardStack({ cards }: { cards: CardView[] }) {
  const n = cards.length;
  return (
    <div className="relative mx-auto h-[250px] w-[310px] [--spread:170px] sm:h-[330px] sm:w-[460px] sm:[--spread:260px]">
      {cards.map((c, i) => {
        const t = n > 1 ? i / (n - 1) - 0.5 : 0; // -0.5 … 0.5
        return (
          <div key={c.id} className="absolute left-1/2 top-4 origin-bottom sm:top-6" style={{ transform: `translateX(calc(-50% + ${t} * var(--spread))) translateY(${Math.abs(t) * 30}px) rotate(${t * 18}deg)`, zIndex: i + 1 }}>
            <div className="sm:scale-125 sm:origin-top">
              <PlayerCard card={c} size="sm" showcase />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Your seven on a pitch (or empty spots to fill). */
function TeamPitch({ name, picks }: { name: string | null; picks: Array<{ isCaptain: boolean; player: { displayName: string; lastName: string; position: string } }> }) {
  const rows: Array<["ATT" | "MID" | "DEF" | "GK", number]> = [["ATT", 2], ["MID", 2], ["DEF", 2], ["GK", 1]];
  const byPos = (p: string) => picks.filter((s) => s.player.position === p);
  return (
    <div className="w-full max-w-sm">
      <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-[repeating-linear-gradient(0deg,#1d5a2a_0px,#1d5a2a_34px,#226632_34px,#226632_68px)] px-3 py-4 shadow-2xl">
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
          <g fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.6">
            <rect x="3" y="3" width="94" height="134" />
            <line x1="3" y1="70" x2="97" y2="70" />
            <circle cx="50" cy="70" r="11" />
            <rect x="25" y="3" width="50" height="20" />
            <rect x="25" y="117" width="50" height="20" />
          </g>
        </svg>
        <p className="relative mb-2 text-center text-[10px] font-black uppercase tracking-[0.18em] text-white/80">{name ? `Your team · ${name}` : "Your seven"}</p>
        <div className="relative space-y-3">
          {rows.map(([pos, count]) => {
            const got = byPos(pos);
            const spots = Math.max(count, got.length);
            return (
              <div key={pos} className="flex justify-center gap-3">
                {Array.from({ length: spots }, (_, k) => {
                  const s = got[k];
                  return (
                    <span key={k} className="flex w-20 flex-col items-center gap-1">
                      <span className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 text-[10px] font-black ${s ? "border-white bg-[#0b0e0c] text-[#adfc07]" : "border-dashed border-white/50 bg-black/20 text-white/60"}`}>
                        {pos}
                        {s?.isCaptain && <span className="absolute -right-1 -top-1 rounded-full bg-[#adfc07] px-1 text-[9px] font-black text-[#0a0d02]">C</span>}
                      </span>
                      <span className="w-full truncate rounded bg-black/55 px-1 text-center text-[10px] font-bold text-white">{s ? s.player.lastName || s.player.displayName : "Pick"}</span>
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Real cards for the Packs slide: popular Bronze, Silver and Gold, then a Ruby, Diamond and Rainbow. */
async function packShowcase(): Promise<CardView[]> {
  const top = { club: { league: { isTopFlight: true } } };
  const pick = async (category: "BRONZE" | "SILVER" | "GOLD", names: string[]) =>
    (await cardViews({ serial: 1, finish: null, template: { category, edition: "STANDARD", player: { displayName: { in: names } } } }, undefined, 1))[0] ??
    (await cardViews({ serial: 1, finish: null, template: { category, edition: "STANDARD", player: top } }, [{ template: { player: { squadNumber: "asc" } } }], 1))[0];
  const [bronze, silver, gold, spare] = await Promise.all([
    pick("BRONZE", ["Bukayo Saka", "Declan Rice"]),
    pick("SILVER", ["Cole Palmer", "Phil Foden"]),
    pick("GOLD", ["Erling Haaland", "Mohamed Salah"]),
    cardViews({ serial: 1, finish: null, template: { category: "GOLD", edition: "STANDARD", player: { displayName: { in: ["Alexander Isak", "Florian Wirtz", "Bukayo Saka"] } } } }, undefined, 3),
  ]);
  const finish = async (kind: "RUBY" | "DIAMOND" | "RAINBOW", i: number): Promise<CardView | undefined> => {
    const real = (await cardViews({ finish: { kind } }, undefined, 1))[0];
    if (real) return real;
    // None pulled yet: show what one looks like on a popular Gold.
    const base = spare[i] ?? gold;
    return base ? { ...base, id: `${base.id}-${kind}`, finish: { kind, serial: 1, of: FINISHES[kind].perPlayer } } : undefined;
  };
  const finishes = await Promise.all([finish("RUBY", 0), finish("DIAMOND", 1), finish("RAINBOW", 2)]);
  return [bronze, silver, gold, ...finishes].filter((c): c is CardView => !!c);
}
