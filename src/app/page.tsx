import Link from "next/link";
import { PlayerCard } from "@/components/player-card";
import { getCurrentUser } from "@/server/auth/session";
import { binderTotals } from "@/server/binder";
import { setProgress } from "@/server/collections";
import { db } from "@/server/db";
import { currentGameweek } from "@/server/gameweeks";
import { cardViews } from "@/server/views";
import { balanceMinor, fmtMp } from "@/server/wallet";
import { fmtDate, relativeTime } from "@/lib/view";

export default async function Home() {
  const user = await getCurrentUser();
  return user ? <Dashboard userId={user.id} name={user.displayName} /> : <Landing />;
}

async function Landing() {
  const showcase = await cardViews(
    { template: { category: "GOLD", edition: "STANDARD", player: { club: { league: { isTopFlight: true } } } }, supplyState: { in: ["AVAILABLE", "RECIRCULATING"] }, serial: 1 },
    [{ template: { player: { squadNumber: "asc" } } }],
    40,
  );
  const picks = [showcase[3], showcase[0], showcase[11]].filter(Boolean);
  return (
    <div className="space-y-14 pt-4">
      <section className="relative grid items-center gap-10 overflow-hidden rounded-[32px] border border-ink-700/70 bg-ink-900/60 p-6 sm:p-10 md:grid-cols-[1.15fr_1fr]">
        <div className="relative z-10 space-y-6">
          <span className="tag text-fg">Gameweek live · Premier League to National League</span>
          <h1 className="text-6xl font-extrabold leading-[0.9] sm:text-7xl lg:text-8xl">
            Pack it.
            <br />
            Pick it.
            <br />
            <span className="text-lime">Win it.</span>
          </h1>
          <p className="max-w-md text-lg text-muted">
            Real players from 116 English clubs. Open packs, build a 7-a-side squad, and score points from what your players do on the
            pitch every weekend.
          </p>
          <div className="flex max-w-sm flex-col gap-3">
            <Link href="/register" className="btn-primary py-4 text-sm">
              Claim your free 11-player squad
            </Link>
            <Link href="/how-it-works" className="btn-ghost py-4 text-sm">
              How it works →
            </Link>
          </div>
        </div>
        <div className="relative flex h-[380px] items-center justify-center overflow-hidden sm:overflow-visible">
          {picks.map((c, i) => (
            <div
              key={c.id}
              className="absolute"
              style={{ transform: `translateX(${(i - 1) * 120}px) translateY(${i === 1 ? -6 : 14}px) rotate(${(i - 1) * 9}deg)`, zIndex: i === 1 ? 2 : 1 }}
            >
              <PlayerCard card={c} size={i === 1 ? "lg" : "md"} />
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["Collect", "Bronze, Silver and Gold cards. Every card is a numbered copy with its own history and live value."],
          ["Compete", "1 GK, 2 DEF, 2 MID, 2 ATT plus four subs. If a starter doesn't play, your bench comes on automatically."],
          ["Win", "Points from real goals, assists, clean sheets and saves. Top managers win packs; complete sets for MP credit."],
        ].map(([t, d]) => (
          <div key={t} className="panel p-6">
            <h2 className="text-3xl font-extrabold text-lime">{t}</h2>
            <p className="mt-2 text-sm text-muted">{d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

async function Dashboard({ userId, name }: { userId: string; name: string }) {
  const [gw, totals, unopened, recent, credit, sets] = await Promise.all([
    currentGameweek(),
    binderTotals(userId),
    db.packEntitlement.findMany({ where: { userId, status: "UNOPENED" }, include: { packSku: true } }),
    cardViews({ ownerId: userId, supplyState: "HELD" }, [{ updatedAt: "desc" }], 10),
    balanceMinor(userId),
    setProgress(userId),
  ]);
  const comps = gw
    ? await db.competition.findMany({
        where: { gameweekId: gw.id },
        include: { entries: { where: { userId } }, _count: { select: { entries: true } } },
        orderBy: { name: "asc" },
      })
    : [];
  const lock = comps[0]?.locksAt;
  const open = gw && (gw.status === "OPEN" || gw.status === "UPCOMING");
  const nearestSet = sets
    .map((s) => ({ s, have: s.requirements.filter((r) => r.satisfied).length, need: s.requirements.length }))
    .sort((a, b) => b.have / b.need - a.have / a.need)[0];

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[32px] border border-ink-700/70 bg-ink-900/70 p-6 sm:p-10">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-lime/15 blur-3xl" aria-hidden="true" />
        <span className="tag text-fg">{gw ? `Gameweek ${gw.number} · ${gw.season}` : "Welcome"}</span>
        <h1 className="mt-5 text-6xl font-extrabold sm:text-7xl">
          {open ? (
            <>
              Pick your
              <br />
              <span className="text-lime">squad</span>
            </>
          ) : gw?.status === "SETTLED" ? (
            <>
              Results
              <br />
              <span className="text-lime">are in</span>
            </>
          ) : (
            <>
              Matchday
              <br />
              <span className="text-lime">is live</span>
            </>
          )}
        </h1>
        <p className="mt-3 text-lg text-muted">
          {open && lock ? `Welcome back, ${name}. Squads lock ${relativeTime(lock)} — 10 minutes before the first kick-off.` : `Welcome back, ${name}.`}
        </p>
        {lock && <p className="text-xs text-faint">Deadline {fmtDate(lock)}</p>}
        <div className="mt-6 flex max-w-sm flex-col gap-3">
          <Link href="/football" className="btn-primary py-4 text-sm">
            {open ? "Pick squad now" : "Live scores"}
          </Link>
          {unopened.length > 0 && (
            <Link href="/packs" className="btn-gold py-4 text-sm">
              Open {unopened.length} pack{unopened.length > 1 ? "s" : ""}
            </Link>
          )}
        </div>
      </section>

      <section className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0">
        <Promo href="/profile" kicker="MP credit" title={fmtMp(credit)} sub="Spend it on packs" tone="gold" />
        {nearestSet && (
          <Promo href="/collections" kicker="Nearest set" title={`${nearestSet.have}/${nearestSet.need}`} sub={`${nearestSet.s.set.name} · +10 MP`} tone="lime" />
        )}
        <Promo
          href="/binder"
          kicker="My club"
          title={`${totals.total} cards`}
          sub={`${totals.byCategory.GOLD} Gold · ${totals.byCategory.SILVER} Silver · ${totals.byCategory.BRONZE} Bronze`}
          tone="plain"
        />
      </section>

      {gw && (
        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-4xl font-extrabold">This gameweek</h2>
            <Link href="/football" className="text-xs font-extrabold uppercase tracking-[0.16em] text-lime">
              All games →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {comps.map((c) => {
              const e = c.entries[0];
              return (
                <Link key={c.id} href={`/competitions/${c.id}`} className="panel p-5 transition hover:border-lime/50">
                  <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted">
                    <span>{c.format.replace("_", " ").toLowerCase()}</span>
                    <span>{c._count.entries} in</span>
                  </div>
                  <div className="mt-2 font-display text-2xl font-extrabold uppercase">{c.name.split(" · ")[0]}</div>
                  <div className="mt-3 text-sm font-semibold">
                    {e ? (
                      e.finalPoints !== null ? (
                        <span className="text-lime">
                          {e.finalPoints} pts · #{e.rank}
                        </span>
                      ) : e.provisionalPoints !== null ? (
                        <span className="text-mint">{e.provisionalPoints} pts live</span>
                      ) : (
                        <span className="text-mint">Squad entered ✓</span>
                      )
                    ) : c.status === "OPEN" ? (
                      <span className="text-warn">Enter now →</span>
                    ) : (
                      <span className="text-faint">Not entered</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-4xl font-extrabold">Latest cards</h2>
          <Link href="/binder" className="text-xs font-extrabold uppercase tracking-[0.16em] text-lime">
            My club →
          </Link>
        </div>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
          {recent.map((c) => (
            <Link key={c.id} href={`/cards/${c.id}`} className="shrink-0">
              <PlayerCard card={c} size="sm" />
            </Link>
          ))}
          {!recent.length && <p className="text-sm text-muted">No cards yet — open your Starter Pack!</p>}
        </div>
      </section>
    </div>
  );
}

function Promo({ href, kicker, title, sub, tone }: { href: string; kicker: string; title: string; sub: string; tone: "gold" | "lime" | "plain" }) {
  const ring = tone === "gold" ? "border-gold/50" : tone === "lime" ? "border-lime/40" : "border-ink-700";
  const k = tone === "gold" ? "text-gold" : tone === "lime" ? "text-lime" : "text-muted";
  return (
    <Link href={href} className={`panel flex min-w-[260px] snap-start items-center gap-4 p-5 ${ring}`}>
      <span
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full font-display text-2xl font-extrabold ${
          tone === "gold" ? "foil-gold text-black/70" : tone === "lime" ? "bg-lime text-ink-950" : "bg-ink-800 text-fg"
        }`}
        aria-hidden="true"
      >
        {tone === "gold" ? "◆" : tone === "lime" ? "★" : "♜"}
      </span>
      <span className="min-w-0">
        <span className={`block text-[10px] font-extrabold uppercase tracking-[0.2em] ${k}`}>{kicker}</span>
        <span className="block font-display text-3xl font-extrabold leading-tight">{title}</span>
        <span className="block truncate text-xs text-muted">{sub}</span>
      </span>
    </Link>
  );
}
